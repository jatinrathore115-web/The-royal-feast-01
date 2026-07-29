/* ============================================================================
   PRELOADER  —  fetch EVERYTHING before the reader can start.

   Loaded BEFORE script.js so the loading bar is on screen from the first paint.

   WHAT IT DOES
     • Hides the START button (body.preloading) and shows a themed progress bar
       in its place. The button is revealed — with a pop-in — only once 100% of
       the assets in preload-manifest.js have been fetched.
     • Streams every asset with a ReadableStream reader, so progress is
       BYTE-ACCURATE rather than a file count. Each file is weighted by its REAL
       on-disk size (the generated table in preload-manifest.js) and refined by
       Content-Length when the server sends one.
     • The displayed percentage is MONOTONIC — it can never go backwards, even
       when Content-Length disagrees with the size table or a transfer is
       re-weighted mid-flight.
     • Swaps fetched media onto their elements as blob: URLs, so "loaded" really
       means "local, no network needed". Each swapped element gets a ONE-TIME
       error fallback that reverts to the original file URL (see revertToOrigin).
     • Queues SMALLEST-FIRST (the manifest is pre-sorted) with a concurrency cap,
       so cover art, buttons and posters all land in the first seconds and are
       never starved behind the big story videos.
     • Does NOT touch the embedded game. See GAME_RE below — the game warms
       ITSELF, off the critical path, and must never gate the START button.

   FAILURE PATHS NEVER BLOCK
     A failed, stalled or aborted transfer — and file://, where fetch() of a
     relative path is blocked outright — counts as DONE. The bar still reaches
     100%, the button still appears, and the affected element simply keeps its
     original src and loads over the network the normal way. There is a per
     transfer stall timeout, a per-transfer hard ceiling, and a global watchdog,
     so no combination of network faults can leave the reader on a dead
     loading screen.

   BROWSER SUPPORT
     fetch + ReadableStream + URL.createObjectURL: Chrome, Edge, Firefox and
     Safari 15+ — the same set that plays this project's WebM/Ogg media. Where
     streaming is unavailable the code falls back to a non-streaming fetch
     (progress jumps per file instead of per chunk); where fetch itself is
     unavailable it degrades to "everything counts as done" and simply reveals
     the button, exactly like the file:// path.
   ============================================================================ */
(function () {
  "use strict";

  /* ==========================================================================
     THE FLIPBOOK IS THE ONLY BLOCKING RESOURCE.

     The generated manifest inventories the whole SITE, which includes the
     embedded game in "LBD 1/" — 99 files, ~9.2 MB of sprites and voice-over
     clips. Gating the START button on those made the book's first load wait on
     assets no reader can reach until the game page, which is exactly the cost
     this build exists to remove.

     So the game is filtered OUT of the blocking set here, and not fetched by
     this file at all — no duplicate work. It is warmed instead by:
       • script.js  — sets the hidden iframe's src on an idle slice after the
                      flipbook's window `load`, so the game boots silently; and
       • LBD 1/embed-bridge.js — walks the game's own data/config and warms every
                      sprite and clip in small idle chunks, THROUGH the game's
                      audio cache, so the element that later plays is the one
                      already downloaded.

     The one exception is the game page's leaf poster: that image is painted by
     the BOOK (on the leaf, while the page turns), so it belongs to the book's
     own art and stays in the blocking set.
     ========================================================================== */
  var GAME_RE   = /^LBD%201\//;
  var GAME_KEEP = { "LBD%201/assets/Start2.webp": 1 };   // the game page's leaf poster
  var MANIFEST  = (window.PRELOAD_MANIFEST || []).filter(function (e) {
    return !GAME_RE.test(e.url) || GAME_KEEP[e.url];
  });

  /* ---- tuning ------------------------------------------------------------ */
  var CONCURRENCY  = 5;        // parallel transfers (spec: ~5)
  var STALL_MS     = 12000;    // no new bytes for this long -> give up on that file
  var HARD_MS      = 120000;   // absolute ceiling for a single transfer
  var GLOBAL_MS    = 180000;   // last-resort: reveal the button no matter what
  var MIN_SHOW_MS  = 400;      // keep the bar up briefly so it never just flickers

  /* ---- state ------------------------------------------------------------- */
  var expected = MANIFEST.map(function (e) { return Math.max(1, e.bytes); });
  var loaded   = MANIFEST.map(function () { return 0; });
  var settled  = MANIFEST.map(function () { return false; });
  var blobs    = Object.create(null);   // absolute request URL -> blob: URL
  var origins  = Object.create(null);   // blob: URL -> original absolute URL
  var shownPct = 0;                     // monotonic displayed percentage
  var doneCount = 0;
  var finished = false;
  var startedAt = Date.now();

  /* ---- DOM --------------------------------------------------------------- */
  var bar     = document.getElementById("preloadBar");
  var fill    = document.getElementById("preloadFill");
  var pctText = document.getElementById("preloadPct");
  var playBtn = document.getElementById("hint");

  // Gate the UI immediately: the button must not be tappable before we are ready.
  document.body.classList.add("preloading");

  function absUrl(u) {
    try { return new URL(u, document.baseURI).href; } catch (_) { return u; }
  }

  /* ---- progress ---------------------------------------------------------- */
  function render() {
    var sumL = 0, sumE = 0;
    for (var i = 0; i < MANIFEST.length; i++) { sumL += loaded[i]; sumE += expected[i]; }
    var pct = sumE > 0 ? (sumL / sumE) * 100 : 100;
    // Hold just short of 100 until every file has actually settled, so the bar
    // cannot read "100%" while a transfer is still open.
    if (doneCount < MANIFEST.length && pct > 99.5) pct = 99.5;
    if (pct > shownPct) shownPct = pct;             // MONOTONIC — never goes back
    var v = Math.max(0, Math.min(100, shownPct));
    if (fill) fill.style.width = v.toFixed(2) + "%";
    if (pctText) pctText.textContent = Math.floor(v) + "%";
    if (bar) bar.setAttribute("aria-valuenow", String(Math.floor(v)));
  }

  function settle(i) {
    if (settled[i]) return;
    settled[i] = true;
    loaded[i] = expected[i];        // count the whole weight, success OR failure
    doneCount++;
    render();
    if (doneCount >= MANIFEST.length) complete();
  }

  /* ---- blob adoption ----------------------------------------------------- */
  // Revert a blob-backed element to the original network URL. Used by the
  // one-time error fallback below: if the blob is unreadable for any reason the
  // element must still show its media rather than break.
  function revertToOrigin(el) {
    var cur = el.currentSrc || el.src || "";
    var orig = el.dataset.originSrc || origins[cur];
    if (!orig) return;
    var wasPlaying = el.tagName === "VIDEO" && !el.paused && !el.ended;
    el.src = orig;
    delete el.dataset.originSrc;
    if (el.tagName === "VIDEO" || el.tagName === "AUDIO") {
      try { el.load(); } catch (_) {}
      // Resume playback for a video that was mid-play when the blob failed.
      if (wasPlaying) { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
    }
  }

  // Attach the ONE-TIME error fallback. `once` guarantees a broken revert can
  // never loop: after one revert the element behaves like any normal <img>/<video>.
  function armErrorFallback(el) {
    if (el.dataset.blobGuard) return;
    el.dataset.blobGuard = "1";
    el.addEventListener("error", function () { revertToOrigin(el); }, { once: true });
  }

  // Point one element at its preloaded blob, if we have one for its current src.
  function adopt(el) {
    if (!el || el.dataset.originSrc) return;                  // already adopted
    var cur = el.src || "";                                    // absolute
    var b = blobs[cur];
    if (!b) return;
    // Never yank the source out from under a playing element.
    if ((el.tagName === "VIDEO" || el.tagName === "AUDIO") && !el.paused && !el.ended) return;
    el.dataset.originSrc = cur;
    armErrorFallback(el);
    el.src = b;
    if (el.tagName === "VIDEO" || el.tagName === "AUDIO") { try { el.load(); } catch (_) {} }
  }

  // Sweep the document (and the poster attribute, which is an image URL too).
  function adoptAll(root) {
    var scope = root || document;
    var els = scope.querySelectorAll("img[src], video[src], audio[src]");
    for (var i = 0; i < els.length; i++) adopt(els[i]);
    var vids = scope.querySelectorAll("video[poster]");
    for (var k = 0; k < vids.length; k++) {
      var v = vids[k];
      var pa = v.getAttribute("poster");
      if (!pa || pa.indexOf("blob:") === 0) continue;
      var pb = blobs[absUrl(pa)];
      if (pb) v.setAttribute("poster", pb);
    }
  }

  /* ---- one transfer ------------------------------------------------------ */
  function fetchOne(i) {
    return new Promise(function (resolve) {
      var entry = MANIFEST[i];
      var url = entry.url;
      var ctrl = null;
      try { ctrl = new AbortController(); } catch (_) {}

      var stallTimer = null, hardTimer = null, over = false;
      function stop() {
        clearTimeout(stallTimer); clearTimeout(hardTimer);
        if (over) return;
        over = true;
        settle(i);
        resolve();
      }
      function abortNow() {                   // stalled / took far too long
        try { if (ctrl) ctrl.abort(); } catch (_) {}
        stop();
      }
      function bumpStall() {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(abortNow, STALL_MS);
      }
      hardTimer = setTimeout(abortNow, HARD_MS);
      bumpStall();

      var opts = { credentials: "same-origin" };
      if (ctrl) opts.signal = ctrl.signal;

      var p;
      try { p = fetch(url, opts); } catch (_) { stop(); return; }
      if (!p || !p.then) { stop(); return; }

      p.then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        // Refine the weight with the real Content-Length when we get one.
        var cl = parseInt(res.headers.get("content-length") || "", 10);
        if (isFinite(cl) && cl > 0) { expected[i] = cl; render(); }

        // Non-streaming fallback (no res.body): progress jumps per file.
        if (!res.body || !res.body.getReader) {
          return res.blob().then(function (b) {
            expected[i] = Math.max(expected[i], b.size);
            loaded[i] = expected[i];
            return b;
          });
        }
        var reader = res.body.getReader();
        var chunks = [], got = 0;
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) {
              expected[i] = Math.max(expected[i], got);
              loaded[i] = got;
              render();
              return new Blob(chunks, { type: res.headers.get("content-type") || "" });
            }
            chunks.push(r.value);
            got += r.value.byteLength;
            // Let `expected` grow if the body outruns it (e.g. a gzipped
            // response, where Content-Length is the COMPRESSED size). Combined
            // with the monotonic clamp in render(), the bar stays sane.
            if (got > expected[i]) expected[i] = got;
            loaded[i] = got;
            bumpStall();                       // real bytes -> not stalled
            render();
            return pump();
          });
        }
        return pump();
      }).then(function (blob) {
        if (over) return;                      // aborted while we were reading
        // Only media gets a blob: URL. iframe-code entries are fetched purely to
        // warm the HTTP cache — the iframe document loads them itself.
        if (blob && entry.kind !== "iframe-code") {
          try {
            var b = URL.createObjectURL(blob);
            var key = absUrl(url);
            blobs[key] = b;
            origins[b] = key;
          } catch (_) {}
        }
        stop();
        adoptAll();                            // swap as soon as it lands
      }).catch(function () {
        stop();                                // failure counts as done
      });
    });
  }

  /* ---- queue (smallest-first, capped concurrency) ------------------------ */
  function runQueue() {
    var next = 0;
    function worker() {
      if (next >= MANIFEST.length) return Promise.resolve();
      var i = next++;
      return fetchOne(i).then(worker);
    }
    var workers = [];
    for (var k = 0; k < Math.min(CONCURRENCY, MANIFEST.length); k++) workers.push(worker());
    return Promise.all(workers);
  }

  /* ---- completion -------------------------------------------------------- */
  function complete() {
    if (finished) return;
    finished = true;
    clearTimeout(globalTimer);
    // Force the readout to a clean 100% even if a file was force-settled.
    shownPct = 100; doneCount = MANIFEST.length;
    if (fill) fill.style.width = "100%";
    if (pctText) pctText.textContent = "100%";
    if (bar) bar.setAttribute("aria-valuenow", "100");
    adoptAll();

    var wait = Math.max(0, MIN_SHOW_MS - (Date.now() - startedAt));
    setTimeout(function () {
      window.PRELOADER.ready = true;
      document.body.classList.remove("preloading");
      document.body.classList.add("preloaded");
      if (playBtn) {
        playBtn.classList.add("pop-in");
        // Drop the class once the pop has played so the resting breathing
        // animation (playBreathe) takes over cleanly.
        setTimeout(function () { playBtn.classList.remove("pop-in"); }, 720);
      }
      try {
        window.dispatchEvent(new CustomEvent("assets-ready"));
      } catch (_) {
        var ev = document.createEvent("Event");
        ev.initEvent("assets-ready", true, true);
        window.dispatchEvent(ev);
      }
      var cbs = window.PRELOADER._cbs.splice(0);
      cbs.forEach(function (fn) { try { fn(); } catch (_) {} });
    }, wait);
  }

  // LAST-RESORT watchdog: something pathological (a hung transfer the per-file
  // timers somehow missed, a browser bug) must never trap the reader on the
  // loading screen. Reveal the button; any unfetched asset just loads over the
  // network the normal way when the page that needs it comes up.
  var globalTimer = setTimeout(function () {
    if (!finished) {
      for (var i = 0; i < MANIFEST.length; i++) if (!settled[i]) { settled[i] = true; loaded[i] = expected[i]; doneCount++; }
      complete();
    }
  }, GLOBAL_MS);

  /* ---- public surface ---------------------------------------------------- */
  window.PRELOADER = {
    ready: false,
    _cbs: [],
    // Run fn once every asset has settled (immediately if that already happened).
    whenReady: function (fn) {
      if (typeof fn !== "function") return;
      if (this.ready) fn(); else this._cbs.push(fn);
    },
    blobFor: function (u) { return blobs[absUrl(u)] || null; },
    // Let late-built DOM (script.js builds the leaves after this file runs) pick
    // up blobs + the error fallback.
    adopt: adopt,
    adoptAll: adoptAll,
    revertToOrigin: revertToOrigin,
    armErrorFallback: armErrorFallback,
    total: MANIFEST.length
  };

  /* ---- go ---------------------------------------------------------------- */
  render();

  var canFetch = (typeof fetch === "function") && location.protocol !== "file:";
  if (!MANIFEST.length || !canFetch) {
    // file:// blocks fetch() of relative paths, and a browser without fetch
    // cannot stream at all. Either way: do not block. Everything counts as done
    // and every element keeps its original src.
    for (var i = 0; i < MANIFEST.length; i++) { settled[i] = true; loaded[i] = expected[i]; doneCount++; }
    complete();
  } else {
    runQueue().then(function () {
      // Every worker has drained. settle() already called complete() in the
      // normal case; this is the belt-and-braces path.
      if (!finished) complete();
    });
  }
})();
