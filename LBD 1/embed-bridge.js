/* ============================================================================
 * embed-bridge.js  —  the seam between this game and the Royal Fest flipbook.
 * ----------------------------------------------------------------------------
 * Loaded LAST in index.html, and it adds behaviour without touching game logic:
 *
 *   1. IDLE CHUNKED ASSET WARM-UP (runs always, embedded or standalone)
 *      This game paints most of its art as CSS background-image, and builds the
 *      rest from JS string literals inside round data. Neither reaches the
 *      document until the level that needs it is constructed, so the browser has
 *      no reason to fetch them up front — that is the real cause of a hitch in
 *      the middle of a round, not the initial load. This walks the full asset
 *      list in small idle slices and warms every sprite and clip ahead of use.
 *
 *   2. POSTMESSAGE HANDSHAKE (embedded only — inert when run standalone)
 *        Play tapped  -> {source:"lbd", type:"lbd-start"}    -> book goes fullscreen
 *        game finished-> {source:"lbd", type:"lbd-complete"} -> book shrinks + turns
 *
 * Nothing here is required for the game to run on its own: with no parent frame
 * the handshake never arms, and rounds.js falls back to its own replay path.
 * ========================================================================== */
(function () {
  'use strict';

  window.HS = window.HS || {};

  var EMBEDDED = !!(window.parent && window.parent !== window);

  /* ======================================================================== *
   * IDLE SCHEDULER
   * ------------------------------------------------------------------------
   * requestIdleCallback where it exists, setTimeout where it does not (Safari).
   *
   * When embedded, this document lives in an iframe that is HIDDEN for the whole
   * warm-up — and a hidden frame's idle callbacks can be throttled hard or
   * deprioritised indefinitely. So the rIC path also arms a plain timer as a
   * safety net and takes whichever fires first: we prefer a genuine idle slice,
   * but we never let the queue stall waiting for one.
   * ======================================================================== */
  var SLICE_GAP_MS = 220;    // gap between slices on the timer path
  var IDLE_NET_MS  = 1500;   // if no idle slice arrives by now, run anyway

  function idle(fn) {
    var ran = false;
    function run() { if (ran) return; ran = true; fn(); }
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 600 });
      setTimeout(run, IDLE_NET_MS);          // hidden-iframe safety net
    } else {
      setTimeout(run, SLICE_GAP_MS);         // Safari: no requestIdleCallback
    }
  }

  /* ======================================================================== *
   * ASSET INVENTORY
   * ------------------------------------------------------------------------
   * Everything the game can paint, INCLUDING the paths that no crawler and no
   * "scan the document" trick would ever find:
   *
   *   • CSS url(...) only — style.css sets these as background-image on the
   *     #bg element per screen. They are never <img> tags:
   *         Bgm.webp, Bgm2.webp, BgmSingle.webp, Start2.webp
   *   • Built by string concatenation only — ui.js's GOGO_POSE map holds BARE
   *     filenames and does 'assets/' + pose, so these two appear nowhere as a
   *     complete path in the source:
   *         ThinkGogo.webp, HorizontalGogo.webp
   *   • JS string literals inside round/level data — fetched only when the round
   *     that uses them is built (the rest of the list).
   * ======================================================================== */
  var IMAGES = [
    // --- CSS background-image only (never an <img>) ---
    'assets/Bgm.webp',
    'assets/Bgm2.webp',
    'assets/BgmSingle.webp',
    'assets/Start2.webp',
    // --- 'assets/' + GOGO_POSE[pose] (ui.js) — no complete literal exists ---
    'assets/ThinkGogo.webp',
    'assets/HorizontalGogo.webp',
    // --- the measurable props + hand sprites (round data) ---
    'assets/Table.webp',
    'assets/Candle.webp',
    'assets/candleStandClean.webp',
    'assets/Cloth1.webp',
    'assets/Cloth2.webp',
    'assets/Cloth3.webp',
    'assets/hand.webp',
    'assets/handDrag.webp',
    'assets/handNudge.webp',
    'assets/handOutline.webp',
    'assets/handOutlineAnim.webp',
    'assets/handSpanHand.webp',
    // --- characters, avatars and celebration art ---
    'assets/gogo.webp',
    'assets/gogoWbag.webp',
    'assets/ShowingGogo.webp',
    'assets/successGogo.webp',
    'assets/wrongGogo.webp',
    'assets/taragogo.webp',
    'assets/taragogoOpen.webp',
    'assets/avatar_gogo.webp',
    'assets/avatar_tara.webp',
    'assets/PlayButton.webp',
    'assets/postLbd.webp'      // the end screen — the very last thing to paint
  ];

  // Warmed for HTTP cache only: a <video> is built by the tutorial when needed.
  var VIDEOS = ['assets/handSpanAnimation.webm'];

  /* ======================================================================== *
   * WARM ONE ASSET
   * ======================================================================== */
  var keep = [];   // hold the Image objects so none is collected before use

  // Read the body to COMPLETION. An unread (or partially read) response body can
  // leave the transfer incomplete, which does not populate a cache entry — the
  // whole point here is that the next request is served from cache with no
  // network at all. Failures are silent: a cold asset simply loads the normal
  // way later, exactly as it did before this file existed.
  function cacheFetch(url, done) {
    if (typeof fetch !== 'function') { if (done) done(); return; }
    try {
      fetch(url, { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.blob() : null; })
        .then(function () { if (done) done(); })
        .catch(function () { if (done) done(); });
    } catch (e) { if (done) done(); }
  }

  function warmOne(item, done) {
    if (item.kind === 'img') {
      // An Image() both fills the HTTP cache and decodes, so the first paint of
      // a background-image is instant rather than merely un-networked.
      try {
        var im = new Image();
        im.decoding = 'async';
        im.onload = im.onerror = done;   // handlers BEFORE src, or a cache hit can beat them
        im.src = item.url;
        keep.push(im);
      } catch (e) { done(); }
      return;
    }
    // AUDIO ('vo' / 'sfx') — fetch to completion FIRST, then let the game's own
    // audio cache build its <audio> element, which is then served from the warm
    // HTTP cache. ('file' — the tutorial's .webm — takes the same path and simply
    // matches neither branch below, so it is warmed by the fetch alone; the game
    // builds its own <video> when the tutorial needs it.)
    //
    // The ordering matters. Doing both at once starts TWO concurrent downloads of
    // the same clip and the browser cancels one, which shows up as a stream of
    // net::ERR_ABORTED media requests (the 1.4 MB music bed loses this race every
    // time). Sequencing them costs nothing — we are on idle slices anyway — and
    // it keeps the console clean.
    //
    // The fetch is not redundant with the element: preload="auto" is only a HINT,
    // and browsers routinely stop after metadata, so the element alone does not
    // guarantee the whole clip is local. The element still matters because it is
    // the exact object playVO() / playBgm() later plays.
    cacheFetch(item.url, function () {
      if (item.kind === 'vo' && HS.Audio && HS.Audio.warmVO) HS.Audio.warmVO(item.url);
      else if (item.kind === 'sfx' && HS.Audio && HS.Audio.warmSfx) HS.Audio.warmSfx();
      done();
    });
  }

  /* ======================================================================== *
   * THE QUEUE
   * ------------------------------------------------------------------------
   * ~3 images or ~2 audio clips per slice (audio files are much heavier), so no
   * single slice can hold the main thread long enough to be felt.
   * ======================================================================== */
  var SLICE_BUDGET = 3;
  var COST = { img: 1, vo: 1.5, sfx: 1.5, file: 1.5 };   // 3 x img, or 2 x audio, per slice
  var BOOT_DELAY_MS = 1000;   // let the intro screen paint before we start

  function warmAssets() {
    var queue = [];
    IMAGES.forEach(function (u) { queue.push({ kind: 'img',  url: u }); });
    VIDEOS.forEach(function (u) { queue.push({ kind: 'file', url: u }); });

    // The four non-VO clips. 'sfx' warms them through HS.Audio.warmSfx(), which
    // builds the elements playLightsOn/playHandPlace/playClap/playBgm use — those
    // are created lazily on FIRST play, so without this the first play of each
    // would pay the fetch. Still silent: warmSfx() never calls play().
    ['assets/LighsOn.ogg', 'assets/handPlaceSound.ogg',
     'assets/clapSound.ogg', 'audios/Bgm.ogg'].forEach(function (u) {
      queue.push({ kind: 'sfx', url: u });
    });
    // The voice-over lines come from the audio engine's OWN map, so this list can
    // never drift out of sync with what the game actually speaks.
    if (HS.Audio && HS.Audio.voFileList) {
      HS.Audio.voFileList().forEach(function (u) { queue.push({ kind: 'vo', url: u }); });
    }

    var i = 0, settledCount = 0, allDispatched = false;
    HS.Embed.queued = queue.length;

    /* `warmed` means EVERY transfer has finished, not merely that the queue was
       handed out. Flipping it on dispatch would be a lie under load — the flag
       would read "warmed" while 37 images were still on the wire — and anything
       that trusts it (a test, or future code deciding whether a page is safe to
       show) would be reading a promise the bridge has not kept. */
    function settle() {
      settledCount++;
      HS.Embed.warmedCount = settledCount;
      if (allDispatched && settledCount >= queue.length) HS.Embed.warmed = true;
    }

    function slice() {
      var spent = 0;
      while (i < queue.length && spent < SLICE_BUDGET) {
        var item = queue[i++];
        spent += (COST[item.kind] || 1);
        warmOne(item, settle);
      }
      HS.Embed.dispatched = i;
      if (i < queue.length) { idle(slice); return; }
      allDispatched = true;
      if (settledCount >= queue.length) HS.Embed.warmed = true;   // all already done
    }
    slice();
  }

  /* ======================================================================== *
   * HANDSHAKE
   * ======================================================================== */
  var sent = {};
  function post(type) {
    if (!EMBEDDED || sent[type]) return;
    sent[type] = true;
    try { window.parent.postMessage({ source: 'lbd', type: type }, '*'); } catch (e) { /* no-op */ }
  }

  /* ---- START: the Play tap expands the game out of the book -----------------
   * CAPTURE PHASE, delegated on the document. This is not a style choice:
   * LBD 1/script.js binds #bootBtn with { once: true } and its handler hides the
   * boot gate synchronously. A bubble-phase listener registered here — after
   * that one, since this file loads last — would run only once the gate is
   * already gone, and in the { once: true } case can be skipped altogether.
   * Capturing on the document sees the tap on its way DOWN, before the game's
   * own handler has touched anything. */
  function armStart() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      if (!t.closest('#bootBtn')) return;        // the tap may land on the inner <img>
      post('lbd-start');
    }, true);
  }

  /* ---- COMPLETE: the end screen's Next button ------------------------------
   * Called by rounds.js's endScreen() when Next is tapped (its real game-over
   * flow: postLbd.webp + confetti + the "Yay! You did it!" line + Next).
   *
   * That final voice-over is allowed to FINISH first, so the book never yanks
   * the page away mid-celebration. whenVOIdle() resolves on the clip's `ended`
   * event — and also on error, on being cut off, and on its own internal cap, so
   * it cannot hang. The extra timer below is a second, generous belt: whatever
   * happens to the audio, the learner is returned to the story. */
  var FINAL_VO_WAIT_MS = 9000;
  function complete() {
    if (sent['lbd-complete']) return;
    setTimeout(function () { post('lbd-complete'); }, FINAL_VO_WAIT_MS);   // never stranded
    var wait = (HS.Audio && HS.Audio.whenVOIdle) ? HS.Audio.whenVOIdle(FINAL_VO_WAIT_MS - 500) : null;
    if (wait && wait.then) wait.then(function () { post('lbd-complete'); });
    else post('lbd-complete');
  }

  /* ======================================================================== *
   * PUBLIC SURFACE
   * ======================================================================== */
  HS.Embed = {
    active: EMBEDDED,      // rounds.js checks this to pick complete() vs replay
    complete: complete,
    warmed: false,         // true once every asset transfer has COMPLETED
    warmedCount: 0,        // transfers finished so far
    dispatched: 0,         // transfers started so far
    queued: 0              // total assets in the warm-up queue
  };

  if (EMBEDDED) armStart();

  // The warm-up is worth running standalone too (same mid-game hitch), so only
  // the handshake above is gated on being embedded.
  setTimeout(function () { idle(warmAssets); }, BOOT_DELAY_MS);
})();
