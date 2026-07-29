/* ============================================================================
   THE STORY NIGHT — flipbook behaviour.
   Diagnostic first: surface any REAL JavaScript error on screen (a silent error
   would stop the click handlers from ever attaching). Image / video / network
   load failures are ignored — they have no .message and are handled per-element.
   ============================================================================ */
window.addEventListener("error", function (ev) {
  if (!ev || !ev.message) return;                 // ignore resource-load errors
  var b = document.getElementById("__jsErr");
  if (!b) {
    b = document.createElement("div");
    b.id = "__jsErr";
    b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:100000;" +
      "background:#b00020;color:#fff;font:13px/1.5 monospace;padding:10px;white-space:pre-wrap";
    (document.body || document.documentElement).appendChild(b);
  }
  b.textContent = "⚠ JavaScript error (this is likely why the book won't open):\n" +
    ev.message + "\n" + (ev.filename || "") + " : line " + ev.lineno;
});

// If you can read this line in the console, the script parsed with NO syntax
// error and you are running the CURRENT file (not a cached copy).
console.log("%c✅ [The Story Night] loaded — 3D flipbook · full-bleed pages · speech bubbles.",
            "font-weight:bold;color:#7d5fd0;font-size:13px");

/* ============================================================================
   ██  EDIT YOUR CONTENT HERE  ██
   ----------------------------------------------------------------------------
   Every entry below is ONE page of the book, shown in order after the cover.

     • type   : "video"  → a full-page video (e.g. assets/1.webm)
                "image"  → a full-page picture (e.g. assets/3 page.webp)
     • src    : the media file for that page.
     • delay  : (video only, optional) milliseconds to wait after landing on the
                page before the video starts (e.g. delay: 3000 → starts after 3s).
                Omit / 0 → the video starts instantly.

   Add / remove / reorder pages freely — the flip engine updates automatically.
   ============================================================================ */
// THE ROYAL FEAST — the four story videos, page by page, in order. Each video
// is full 16:9 (matches the page) and has a matching first-frame poster in
// assets/posters/ so the scene — and its warm theme colour — shows INSTANTLY.
// Add / remove / reorder pages freely — the flip engine updates automatically.
// MEDIA FORMAT: the story clips are WebM (VP9 video + Opus audio) — supported by
// Chrome, Edge, Firefox and Safari 15+, the same set that runs the rest of this
// book. Converted from the 1080p H.264/AAC masters at ~67% smaller with no change
// to pixel dimensions or duration.
const pages = [
  { type: "video", src: "assets/1.webm" },   // 1 — opening video
  // 2 — MP4/H.264, not WebM like its neighbours: assets/2.webm no longer exists on
  // disk (the clip was re-exported as assets/2.mp4), and this page was pointing at
  // the missing file, so it 404'd and showed no video at all. Re-encode to WebM to
  // match pages 1/3/4 (this file is ~20 MB vs ~2-4 MB for the others) and change
  // this line back.
  { type: "video", src: "assets/2.mp4" },    // 2
  { type: "video", src: "assets/3.webm" },   // 3
  // 4 — the handspan GAME (from the "LBD 1" folder), run in a body-level iframe
  // that is booted silently in the background long before you get here. Landing
  // on this page just REVEALS it, parked over the page rectangle so its intro
  // screen reads as artwork printed in the book. Tapping the game's own Play
  // button expands it to true full screen; when the child finishes and taps the
  // game's Next button, it shrinks back and the book turns to the next page.
  // `poster` is the game's title art (Start2.webp) — shown on the leaf while it
  // flips in and as the iframe's backdrop, so there's no dark flash.
  { type: "lbd", src: "LBD%201/index.html", poster: "LBD%201/assets/Start2.webp" },
  { type: "video", src: "assets/4.webm" },   // 5
  { type: "end" },                           // 6 — THE END page (cream) + Replay
];

/* ============================================================================
   ██  END OF EDITABLE CONTENT — engine below (no need to change) ██
   ============================================================================ */

/* ---- Poster path for a page: assets/1.webm → assets/posters/1.webp ------- */
function posterFor(page) {
  if (!page || !page.src) return "";
  return page.src.replace(/^assets\//, "assets/posters/")
                 .replace(/\.(webm|mp4|webp|png|jpe?g)$/i, ".webp");
}

/* ---- Build one page face's media (image OR video OR lbd poster) ---------- */
function makeMedia(page) {
  // "lbd" pages show a STILL poster on the leaf itself (seen while the page turns);
  // the live, interactive game is a separate full-screen-capable overlay iframe
  // (see the LBD OVERLAY section below) — it can't live inside the 3D-transformed
  // leaf because CSS transforms trap position:fixed, so true fullscreen would fail.
  if (page.type === "lbd") {
    const img = document.createElement("img");
    img.className = "page-media";
    img.draggable = false;
    img.addEventListener("dragstart", function (e) { e.preventDefault(); });
    img.decoding = "async";
    img.src = page.poster || "";
    img.alt = "Handspan game — tap Play to start";
    return img;
  }
  const media = page.type === "video"
    ? document.createElement("video")
    : document.createElement("img");
  media.className = "page-media";
  media.draggable = false;                           // never let the image "ghost-drag" out
  media.addEventListener("dragstart", function (e) { e.preventDefault(); });
  media.src = page.src;
  if (page.type === "video") {
    media.loop = false;
    media.playsInline = true;
    media.setAttribute("playsinline", "");            // iOS Safari inline playback
    media.setAttribute("webkit-playsinline", "");
    // FIRST-FRAME POSTER: the page surface (--paper) is deep night-blue, so a video
    // that hasn't painted a frame yet (still buffering, or autoplay was blocked) would
    // show as a BLANK dark-blue page. The poster is that clip's own frame 0, so the
    // scene shows INSTANTLY and — because it equals where playback starts — there's no
    // jump when the video then plays. Posters are tiny (~40KB) and live in assets/posters/.
    media.setAttribute("poster", posterFor(page));
    // LAZY: do NOT eager-buffer. With 25 videos, preload="auto" made the browser
    // open + decode every clip on load (huge memory/CPU spike + open lag). We only
    // buffer the page you're on + the next one, on demand (see warmVideo()).
    media.preload = "none";
    // Tap the video to (re)start it WITH sound — a guaranteed user gesture, so
    // browsers that blocked the auto-start's audio will now allow it.
    media.addEventListener("click", function () {
      media.muted = false;
      try { if (media.ended) media.currentTime = 0; } catch (_) {}
      const p = media.play(); if (p && p.catch) p.catch(function () {});
    });
    // When THIS page's video FULLY finishes: (1) arm the page-turn TUTORIAL so it
    // appears 5s later (never while the video is still playing), and (2) blink +
    // gold-glow the forward arrow for 2s as a "turn the page" cue. Both fire only
    // for the current page; the blink runs ONCE per page arrival (armBlink).
    // NOTE: the forward-gate release for this video is NOT wired here — it is
    // attached per-page-index in the VIDEO GATE section below, which owns all
    // three release paths (ended / error / watchdog). This handler only drives
    // the tutorial + arrow-blink cue.
    media.addEventListener("ended", function () {
      if (!opened || !ready || lbdFullscreen || flipped >= totalPages - 1) return;
      if (!leaves[flipped] || !leaves[flipped].contains(media)) return;   // only the current page
      if (typeof armHintAfterVideo === "function") armHintAfterVideo();    // tutorial: video done → 5s → nudge
      if (!armBlink || !cornerNext) return;      // already pulsed for this visit
      armBlink = false;                          // one pulse per page arrival
      // Delayed by just over the 400ms nextPopIn: on page 1 the arrow only APPEARS
      // at this moment, and starting the glow while it is still popping in would
      // run both animations on the same element. This way it pops in, then glows.
      const pulseIdx = flipped;
      setTimeout(function () {
        if (flipped !== pulseIdx || !cornerNext) return;   // reader already moved on
        cornerNext.classList.remove("glow-pulse");
        void cornerNext.offsetWidth;             // restart the animation cleanly
        cornerNext.classList.add("glow-pulse");
        setTimeout(function () { cornerNext.classList.remove("glow-pulse"); }, 1700);
      }, 440);
    });
  } else {
    media.decoding = "async";
    media.alt = page.alt || "story page";
  }
  return media;
}

/* NOTE — the SPEECH BUBBLE system (makeBubble / makeSpeechBubble, the .bubble and
   .sbub styles, and the two "dialogue box" artwork files) has been REMOVED. No
   entry in `pages` above ever set a `bubble`, so none of it could run: the story
   is told entirely by the videos' own voice-over. The two artwork files it named
   (assets/neel dialogue box for one time..webp and
   assets/dialogue box for everywhere..webp) never existed in this project either,
   so the CSS that referenced them 404'd on every single load.
   To bring bubbles back, add the artwork, restore the styles, and give a page a
   `bubble: { kind, text, box }` — see the EDIT YOUR CONTENT block above. */

/* ---- Build the pages (one CSS 3D "leaf" per entry) ---------------------- */
const flipbookEl  = document.getElementById("flipbook");
const pageStackEl = flipbookEl ? flipbookEl.querySelector(".page-stack") : null;   // right-side page stack
const flipScaleEl = document.getElementById("flipScale");
const coverScene  = document.getElementById("coverScene");
// ONE full 16:9 page per view (single display). page 1 = entry 1. The themed
// book frame forms the left spine/cover edge (always visible when open); pages
// flip normally. No two-page spread.
const totalPages = pages.length;
// Which leaf is the embedded LBD game (-1 if none). Used to show/hide the overlay.
const LBD_INDEX = pages.findIndex(function (p) { return p.type === "lbd"; });

// Each leaf is a full 16:9 page hinged on the LEFT spine:
//   • FRONT = the page's full-bleed image / video (+ its speech bubble, if any).
//   • BACK  = a BLANK parchment sheet (seen edge-on while the page turns).
const leaves = [];
pages.forEach(function (page, i) {
  const leaf = document.createElement("div");
  leaf.className = "leaf";

  const front = document.createElement("div");
  front.className = "face front";
  if (page.type === "end") {
    // THE END — a real final page (cream "paper") with a gold-plum title + Replay.
    front.classList.add("end-page");
    front.innerHTML =
      '<div class="end-page-inner">' +
        '<div class="end-title">THE&nbsp;END</div>' +
        '<button class="replay-btn" id="replayBtn" type="button" aria-label="Replay from the beginning">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>' +
          '</svg>' +
          '<span>Replay</span>' +
        '</button>' +
      '</div>';
  } else {
    // PAGE BACKGROUND = this video's own first frame (its poster). So the page's
    // backdrop always matches the theme/colour of its video — no blue flash while
    // the clip buffers, and any thin edge gap blends into the scene.
    // For an "lbd" game page the src is an HTML file (no derived poster), so use
    // its explicit `poster` (the game's title art) as the leaf backdrop.
    const poster = page.type === "lbd" ? page.poster : posterFor(page);
    if (poster) {
      front.style.backgroundImage    = 'url("' + poster + '")';
      front.style.backgroundSize     = "cover";
      front.style.backgroundPosition = "center";
    }
    front.appendChild(makeMedia(page));                       // full-bleed image / video
  }
  const curl = document.createElement("div");               // moving page-curl shading
  curl.className = "curl";
  front.appendChild(curl);

  const back = document.createElement("div");
  back.className = "face back";                             // blank reverse side (no content)

  leaf.appendChild(front);
  leaf.appendChild(back);
  flipbookEl.appendChild(leaf);
  leaves.push(leaf);
});

/* ---- State + element references ----------------------------------------- */
const bookStage  = document.getElementById("bookStage");
const book       = document.getElementById("book");
const bookPop    = document.getElementById("bookPop");
const bookFloat  = document.getElementById("bookFloat");
const cover      = document.getElementById("cover");
const hint       = document.getElementById("hint");
// NOTE: a pair of always-hidden legacy #prev / #next buttons used to live in
// index.html purely "so existing JS refs stay valid". Both the markup and those
// refs are gone — the real controls are #cornerPrev / #cornerNext below, and every
// forward route funnels through canNavigateForward() regardless.
const cornerPrev  = document.getElementById("cornerPrev");
const cornerNext  = document.getElementById("cornerNext");
const replayBtn   = document.getElementById("replayBtn");   // lives on the THE END page (built above)
// (no homeBtn — the HOME button was removed from the book)

/* ==========================================================================
   LBD OVERLAY  —  the Stairway Shuffle game embedded as one page.
   The game lives in a body-level iframe (#lbdStage) so it can grow to true
   fullscreen (a transform on .flip-scale would otherwise trap position:fixed).
   • pre-LBD  : the overlay is sized/positioned OVER the current page rectangle,
                so the game's home screen looks like it's printed inside the book.
   • start    : the game posts {source:"lbd", type:"lbd-start"} → we expand the
                overlay to fill the whole screen.
   • end/skip : the game posts {source:"lbd", type:"lbd-complete"} → we shrink the
                overlay back into the page and auto-flip to the next page.
   ========================================================================== */
const lbdStage = document.getElementById("lbdStage");
const lbdFrame = document.getElementById("lbdFrame");
let lbdFullscreen = false;   // is the overlay expanded to full screen right now?
let lbdStarted    = false;   // has the child tapped Start at least once this visit?
let lbdWasOn      = false;   // was the overlay showing on the previous refresh?
let lbdExiting    = false;   // guard so "complete" only advances once
let lbdAdvancing  = false;   // true only during the game's own auto-advance turn

// Show the blurred pre-LBD backdrop inside the frame while the game is loading
// (and while it's unloaded) so there is no dark flash — it matches the game's
// own splash background, so the live home screen fades in seamlessly.
if (lbdFrame && LBD_INDEX >= 0 && pages[LBD_INDEX].poster) {
  lbdFrame.style.background = "#0a0f2d url('" + pages[LBD_INDEX].poster + "') center/cover no-repeat";
}
/* ==========================================================================
   GAME-PAGE ESCAPE HATCH  —  three paths, so a broken game can never trap us.

   The game page deliberately blocks ordinary forward navigation: the book
   advances only when the game posts {type:"lbd-complete"}. And while the game is
   fullscreen, CSS hides EVERY book control (body.lbd-fullscreen). Together that
   means a game which never loads — a 404, a script error inside the iframe, a
   network stall — would leave the reader staring at a dead full-screen overlay
   with no way out at all.

   So the same three-path rule the video gate uses applies here:
     1. the event      — {type:"lbd-complete"} from the game (the normal path)
     2. an error path  — the iframe's own `error`, or a document that loaded but
                         has no game in it (its boot button is missing)
     3. a watchdog     — the iframe never fires `load` within LBD_LOAD_MS
   Paths 2 and 3 call lbdFail(), which drops out of fullscreen (restoring the
   arrow controls) and opens this page's forward gate so the reader can
   simply carry on with the story. It deliberately does NOT auto-advance: a game
   that was merely slow should still be playable once it arrives.
   ========================================================================== */
const LBD_LOAD_MS = 20000;   // generous — slow devices must still get to load
let lbdLoadOk  = false;      // has the game document actually loaded?
let lbdEscape  = false;      // has the reader been handed an escape route?
let lbdLoadTimer = null;

function lbdFail() {
  if (lbdEscape) return;
  lbdEscape = true;
  clearTimeout(lbdLoadTimer);
  // Leave fullscreen so the book's own controls are reachable again, and let the
  // forward gate open (see canNavigateForward) so the reader can move on.
  if (lbdFullscreen) setLbdFullscreen(false);
  updateProgress();
}
function onLbdLoad() {
  if (!lbdFrame.dataset.loaded) return;         // the about:blank unload, not the game
  // Loaded is not the same as ALIVE: if the game's own scripts threw, the
  // document still fires `load` but contains no game. Probe for its boot button
  // (same origin, so this is readable) and treat its absence as a failure.
  let alive = false;
  try {
    const doc = lbdFrame.contentDocument;
    alive = !!(doc && doc.getElementById("bootBtn"));
  } catch (_) { alive = true; }                 // unreadable → assume fine, don't punish
  if (!alive) { lbdFail(); return; }
  lbdLoadOk = true;
  clearTimeout(lbdLoadTimer);
}
// Point the iframe at the game. Called from the background warm-up below, and
// again on landing as a belt-and-braces path (if the idle callback never ran).
function ensureLbdLoaded() {
  if (LBD_INDEX < 0 || !lbdFrame || lbdFrame.dataset.loaded) return;
  lbdFrame.dataset.loaded = "1";
  lbdFrame.src = pages[LBD_INDEX].src;
  clearTimeout(lbdLoadTimer);
  lbdLoadTimer = setTimeout(function () { if (!lbdLoadOk) lbdFail(); }, LBD_LOAD_MS);
}
/* ==========================================================================
   BACKGROUND WARM-UP  —  boot the game silently while the reader is still on
   the cover, so landing on its page costs no network at all.

   VERIFIED SAFE — THE GAME DOES NOT AUTOPLAY. Every sound it can make (the
   looping music bed, the Gogo/Tara voice-overs and all SFX) is downstream of
   HS.Audio.unlock(), and unlock() is called from exactly one place: the click
   handler on the game's #bootBtn Play button (LBD 1/script.js). Nothing in its
   boot path calls play(). A game booted into a hidden iframe is therefore
   completely silent, which is what makes warming the LIVE iframe safe rather
   than having to settle for fetching its assets into the HTTP cache.

   TIMING — after the flipbook's own window `load`, AND after the preloader has
   revealed the START button, then on an IDLE slice. requestIdleCallback with a
   setTimeout fallback for Safari, which does not implement it.

   Both gates are needed. `load` alone is not enough: the preloader streams ~16 MB
   of story video and finishes well AFTER the load event, so warming the game at
   `load` would put 9 MB of game assets in direct competition with the book's own
   critical path — the exact thing this design exists to prevent. Waiting for
   PRELOADER.ready means the book is fully interactive before the game asks for a
   single byte. (whenReady fires immediately if it is already done, and the
   preloader's own watchdogs guarantee it always fires, so this cannot deadlock.)

   The overlay is given its real page-rectangle geometry BEFORE the src is set:
   the iframe is hidden but still laid out, so the game's 1280x720 fit() reads a
   true size at boot and landing on the page needs no reflow or re-scale.
   ========================================================================== */
function warmLbd() {
  if (LBD_INDEX < 0 || !lbdFrame || lbdFrame.dataset.loaded) return;
  positionLbdStage();          // real geometry while still hidden → correct fit() at boot
  ensureLbdLoaded();
}
function scheduleLbdWarm() {
  if (typeof requestIdleCallback === "function") {
    // The timeout matters: it guarantees the warm-up happens on a busy device
    // that never reports a truly idle slice.
    requestIdleCallback(warmLbd, { timeout: 3000 });
  } else {
    setTimeout(warmLbd, 1200);                  // Safari has no requestIdleCallback
  }
}
// Gate on the preloader too (see above) — but never DEPEND on it: if preloader.js
// is absent or threw, fall back to the load event alone rather than never warming.
function afterLoadAndAssets(fn) {
  function go() {
    if (window.PRELOADER && typeof window.PRELOADER.whenReady === "function") window.PRELOADER.whenReady(fn);
    else fn();
  }
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}
afterLoadAndAssets(scheduleLbdWarm);

// Tear the game down. Killing the iframe's document is what stops game audio
// INSTANTLY (there is no other way to reach sounds already playing inside it),
// and it guarantees the next visit starts fresh at the intro screen.
function resetLbd() {
  if (!lbdFrame) return;
  lbdStarted = false;
  clearTimeout(lbdLoadTimer);
  lbdLoadOk = false;
  lbdEscape = false;                            // a fresh visit re-locks the page
  lbdFrame.dataset.loaded = "";
  lbdFrame.src = "about:blank";                 // all game sound stops right here
  // ...then immediately re-boot it, hidden, from the now-warm HTTP cache, so a
  // revisit is instant AND always opens on the intro. Deliberately deferred to a
  // later task (scheduleLbdWarm is idle/timer driven) so the about:blank
  // navigation actually commits first — assigning both srcs in one turn can drop
  // the teardown and leave the old document, and its audio, alive.
  scheduleLbdWarm();
}
if (lbdFrame) {
  lbdFrame.addEventListener("load", onLbdLoad);
  lbdFrame.addEventListener("error", function () { lbdFail(); });
}
// Park the overlay exactly over the on-screen page rectangle (pre-LBD look).
function positionLbdStage() {
  if (!lbdStage) return;
  const r = flipScaleEl.getBoundingClientRect();   // the scaled 1280×720 page area
  lbdStage.style.left   = r.left   + "px";
  lbdStage.style.top    = r.top    + "px";
  lbdStage.style.width  = r.width  + "px";
  lbdStage.style.height = r.height + "px";
}
let lbdAnimTimer = null;
function setLbdFullscreen(on) {
  if (!lbdStage) return;
  lbdFullscreen = on;
  positionLbdStage();                        // make the inline page-rect geometry current
  lbdStage.classList.add("lbd-anim");        // turn the box-morph transition ON for this toggle
  void lbdStage.offsetWidth;                 // commit, so the class change below animates from here
  lbdStage.classList.toggle("fullscreen", on);   // expand to / shrink from full screen
  document.body.classList.toggle("lbd-fullscreen", on);
  clearTimeout(lbdAnimTimer);
  lbdAnimTimer = setTimeout(function () { lbdStage.classList.remove("lbd-anim"); }, 460);
}
// Hide + tear down the overlay. Shared by the ordinary page-change path and by
// every route that jumps straight back to the cover (Replay), which
// bypasses refreshMedia() entirely — see resetToStart().
function hideLbdOverlay() {
  if (!lbdStage) return;
  if (lbdFullscreen) setLbdFullscreen(false);   // Replay from a fullscreen game
  lbdStage.classList.remove("visible");
  lbdStage.setAttribute("aria-hidden", "true");
  if (lbdWasOn) {
    lbdWasOn = false;
    resetLbd();                        // kills game audio instantly, then re-warms hidden
  }
}
// Landing on the game page REVEALS the already-booted overlay — no fetch, no
// spinner. It is parked exactly over the page rectangle, so the game's intro
// screen reads as artwork printed in the book; tapping the game's own Play
// button (which posts lbd-start) is what expands it to true fullscreen.
function updateLbdOverlay() {
  if (LBD_INDEX < 0 || !lbdStage) return;
  const onLbd = opened && ready && !animating && flipped === LBD_INDEX;
  if (onLbd) {
    ensureLbdLoaded();                    // no-op if the background warm-up already ran
    if (!lbdFullscreen) positionLbdStage();   // park over the page, at page size
    lbdStage.classList.add("visible");
    lbdStage.setAttribute("aria-hidden", "false");
    lbdWasOn = true;
  } else if (!lbdFullscreen) {           // never hide mid-game while it is fullscreen
    hideLbdOverlay();
  }
}
// Game finished (or the temporary Skip was tapped): come back into the page, then
// automatically turn to the next page.
function exitLbd() {
  if (lbdExiting) return;
  lbdExiting = true;
  setLbdFullscreen(false);                // shrink the game back into the page
  setTimeout(function () {
    lbdExiting = false;
    if (flipped === LBD_INDEX) {
      // Briefly open the game page's forward gate for THIS turn only, so the
      // completion advance succeeds while ordinary page turns stay blocked.
      lbdAdvancing = true;
      goNext();
      lbdAdvancing = false;
    }
  }, 470);                                // just after the shrink transition (.4s)
}
// Listen for the game's messages (start → fullscreen, complete → advance).
window.addEventListener("message", function (e) {
  const d = e && e.data;
  if (!d || d.source !== "lbd") return;
  // Both messages are only ever meaningful while we are actually ON the game
  // page. A message that arrives from a warming-up iframe in the background (or
  // any other frame) must not expand an overlay over the story.
  if (flipped !== LBD_INDEX) return;
  if (d.type === "lbd-start") { lbdStarted = true; setLbdFullscreen(true); }
  else if (d.type === "lbd-complete") { exitLbd(); }
});

let opened = false;      // has the cover been opened?
let ready  = false;      // has the cover FINISHED opening? (flips allowed only then)
let flipped = 0;         // how many leaves are currently turned to the left
let animating = false;   // guard so a new turn can't start mid-flip
// Which pages' videos have FINISHED playing (index → true). The forward Next
// arrow stays locked until the current page's video has ended, so the child
// can't skip ahead mid-clip. Cleared on a fresh read (resetToStart).
const videoWatched = [];
const FLIP_MS = 1150;    // keep in sync with --flip-ms in styles.css
const COVER_OPEN_MS = 6000;  // keep in sync with the coverOpen animation in styles.css
const CLOSE_SETTLE_MS = 560;  // keep in sync with the bookSettle animation in styles.css
const COVER_CLOSE_MS  = 2000; // Replay: cover swings shut (reverse open); sync with coverClose in styles.css
let _openTimer = null;   // pending "cover finished opening" timer
let _homeTimer = null;   // pending "cover finished closing → back to the cover" timer

/* ---- Responsive: scale the FIXED 1280x720 book to fit the viewport --------
   ORIGINAL fit — 96% of width / 84% of height — so the book size and the arrows
   (which stay at the viewport's bottom corners, via CSS) look exactly as before.
   The ONLY addition is a safeguard on SHORT screens: never let the book grow so
   tall that it covers the bottom controls. That safeguard changes nothing on
   normal/large screens (there the 0.84 factor is the smaller of the two); it only
   shrinks the book a little on small screens so the arrows + progress stay visible.
   Only this CSS transform scale changes, so the paper curl is never distorted. */
/* These MIRROR the clamps in styles.css for .corner-arrow. The book
   is scaled so the controls always land in the margin OUTSIDE the artwork, at
   every viewport — keep the two in sync if the CSS clamps ever change. */
function clampPx(min, preferred, max) { return Math.min(Math.max(min, preferred), max); }
function controlBoxPx()  { return clampPx(84, window.innerWidth * 0.10, 124); }   // clamp(84px,10vw,124px)
function arrowInsetPx()  { return clampPx(12, window.innerWidth * 0.025, 34); }   // clamp(12px,2.5vw,34px)

function fitScale() {
  const CTRL = 64;                                   // min top/bottom room kept for the controls
  // SIDE GUTTER: the Back/Next boxes are fixed to the viewport's bottom corners
  // OUTSIDE the book. Reserve a gutter wide
  // enough for a whole control box plus its inset, so no control can ever sit
  // over the artwork. On a 1366x768 screen this trims the book by ~4% — the
  // difference between the arrows clipping the page edge and clearing it.
  const gutter = controlBoxPx() + arrowInsetPx();
  const availW = Math.min(window.innerWidth * 0.88, window.innerWidth - gutter * 2);
  const availH = Math.min(window.innerHeight * 0.80, window.innerHeight - CTRL * 2);
  const s = Math.min(availW / 1280, availH / 720);
  flipScaleEl.style.setProperty("--book-scale", s.toFixed(4));
  // keep the page-turn hint glued to the forward arrow when the viewport changes
  if (flipHint && flipHint.classList.contains("show")) positionFlipHint();
}

/* ---- Render / stacking for the CSS leaf flip ---------------------------- */
// A TURNED leaf sits to the left (rotateY -180deg, showing its blank back over
// the cover); an UN-turned leaf lies flat on top of the cover. z-index keeps the
// current (top un-turned) page in front, and stacks more-recently turned leaves
// above earlier ones on the left pile.
function updateZ() {
  leaves.forEach(function (leaf, i) {
    leaf.style.zIndex = (i < flipped) ? (200 + i) : (100 - i);
  });
}
/* ==========================================================================
   LEAF WINDOWING  —  keep the GPU texture budget under control.

   Every leaf is a 3D-transformed, will-change:transform element, i.e. its own GPU
   compositing layer, and each carries a full-bleed 1080p video or image. Leave
   them all live and the browser can exceed its texture budget and start EVICTING
   layers — which shows up as pages that intermittently paint BLANK on real
   machines while devtools looks completely clean (devtools doesn't reproduce the
   memory pressure).

   So only the leaves that can actually be SEEN stay rendered:
     • leaves[flipped]      — the current page
     • leaves[flipped + 1]  — revealed underneath as the current page turns away
     • leaves[flipped - 1]  — the most recently turned leaf, whose back is the
                              left-hand surface, and which swings back on a
                              backward turn
   Everything else is guaranteed-occluded: an un-turned leaf further down the
   stack sits under an opaque full-bleed page, and an earlier turned leaf sits
   under leaves[flipped - 1]'s back face. Those get .offscreen, which applies
   visibility:hidden AND will-change:auto — the will-change reset is the part that
   actually lets the compositor release the texture; visibility alone keeps it.

   Re-run on EVERY navigation (renderLeaves is called by every turn, drag and
   reset), so the window always tracks where the reader actually is.
   ========================================================================== */
var LEAF_WINDOW = 1;      // how many leaves either side of the current one stay live
function windowLeaves() {
  leaves.forEach(function (leaf, i) {
    var near = Math.abs(i - flipped) <= LEAF_WINDOW;
    leaf.classList.toggle("offscreen", !near);
  });
}

function renderLeaves() {
  leaves.forEach(function (leaf, i) {
    if (i < flipped) leaf.classList.add("flipped");
    else             leaf.classList.remove("flipped");
  });
  updateZ();
  windowLeaves();          // re-window on every navigation
}

/* ---- Per-page media -----------------------------------------------------
   Play the CURRENT page's video (pause every other), and pop the current page's
   speech bubble in ONCE, only after the page has fully settled. Called after
   each flip completes and once the cover has finished opening. */
let mediaDelayTimer = null;   // pending "start this video after N ms" timer
let mediaDelayIdx = -1;       // which page that pending timer belongs to
let lastMediaIdx = -1;        // last page refreshMedia handled (to arm the blink once)
let armBlink = false;         // allow the video-end arrow blink ONCE per page arrival
let hintArmed = false;        // the page-turn tutorial is allowed only AFTER this page's video ends

function playVideoNow(v) {
  try {
    v.preload = "auto";                       // make sure it's buffering before we play
    if (v.ended) v.currentTime = 0;
    v.muted = false;                          // try WITH sound (primed in the Play gesture)
    const p = v.play();
    if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); });
  } catch (_) {}
}

/* Buffer ONE page's video on demand (only the current + next page are ever
   warmed, so we never spin up all 25 decoders at once). */
function warmVideo(i) {
  const leaf = leaves[i];
  if (!leaf) return;
  const v = leaf.querySelector("video.page-media");
  if (v && v.preload !== "auto") { v.preload = "auto"; try { v.load(); } catch (_) {} }
}

/* Unlock ONE page's video for instant, sound-enabled playback: a muted
   play()→pause() done INSIDE a user gesture. We prime only the page being shown
   and the next one — priming all 25 at once was the opening lag. */
function primeVideo(i) {
  const leaf = leaves[i];
  if (!leaf) return;
  const v = leaf.querySelector("video.page-media");
  if (!v || v.dataset.primed) return;
  v.dataset.primed = "1";
  try {
    v.muted = true; v.preload = "auto";
    const p = v.play();                       // start within the gesture → element is "activated"
    if (p && p.catch) p.catch(function () {});
    v.pause();                                // pause synchronously
    v.currentTime = 0;
  } catch (_) {}
}

function refreshMedia() {
  const idx = flipped;                         // the front-most page right now
  // On arriving at a NEW page, re-arm the video-end blink and DISARM the tutorial
  // hint — it stays hidden until THIS page's video has finished (see armHintAfterVideo).
  if (idx !== lastMediaIdx) {
    lastMediaIdx = idx; armBlink = true; hintArmed = false;
    // NEW PAGE → re-arm its forward gate (and drop any previous page's watchdog).
    // This runs on backwards arrivals too, so revisiting a video page locks Next
    // again rather than inheriting the last visit's "watched" state.
    armVideoGate(idx);
  }
  updateFirstPageNextArrow();
  // Left the page a delayed video was counting down on? Cancel that countdown.
  if (mediaDelayTimer && mediaDelayIdx !== idx) {
    clearTimeout(mediaDelayTimer); mediaDelayTimer = null; mediaDelayIdx = -1;
  }
  // Buffer + gesture-unlock ONLY this page and the next (so the upcoming flip is
  // instant and keeps sound) — never all 25 videos at once.
  warmVideo(idx); warmVideo(idx + 1); primeVideo(idx + 1);
  // Pause every video that is NOT the current page.
  leaves.forEach(function (leaf, i) {
    if (i === idx) return;
    const v = leaf.querySelector("video.page-media");
    if (v) { try { v.pause(); } catch (_) {} }
  });
  // Start (or schedule) the current page's video.
  const cur = leaves[idx];
  const v = cur && cur.querySelector("video.page-media");
  if (v) {
    const delayMs = (pages[idx] && pages[idx].delay) ? pages[idx].delay : 0;
    if (delayMs > 0) {
      // Already playing this page, or already counting down for it → leave it alone
      // (so the flip-start + flip-end calls don't restart the 3s countdown).
      if (mediaDelayIdx === idx && (mediaDelayTimer || !v.paused)) { /* keep going */ }
      else {
        try { v.pause(); v.currentTime = 0; } catch (_) {}   // hold on the first frame
        mediaDelayIdx = idx;
        mediaDelayTimer = setTimeout(function () {
          mediaDelayTimer = null;
          if (flipped === idx) playVideoNow(v);               // only if still on this page
        }, delayMs);
      }
    } else {
      playVideoNow(v);                          // no delay → instant
    }
  }
  updateLbdOverlay();                           // show/hide the embedded LBD game
  // Right-side page stack shrinks toward the end: 3 sheets → … → 0 on the last page.
  if (pageStackEl) pageStackEl.dataset.count = String(Math.max(0, Math.min(3, totalPages - 1 - flipped)));
  // Restart the idle → page-turn-hint countdown for the page we've just landed on
  // (uses the NEW `flipped`, so the delay is right: 5s on page 1, 10s afterwards).
  if (typeof resetIdleHint === "function") resetIdleHint();
}

/* ---- Navigation (drives the CSS leaf flip) ------------------------------ */
function turnLeaf(leaf) {                 // shared flip visuals + timing
  leaf.style.zIndex = 300;               // lift the turning sheet above everything
  leaf.classList.add("flipping");        // enables the moving curl shading
  renderLeaves();
  refreshMedia();                        // START now → the target video plays INSTANTLY
                                          // (as the page is revealed, not after the flip)
  playFlip();
  updateProgress();
  setTimeout(function () {
    leaf.classList.remove("flipping");
    animating = false; updateZ(); updateProgress();
    refreshMedia();                      // re-assert once settled (idempotent safety net)
  }, FLIP_MS + 40);
}
function goNext() {
  // THE single forward gate — the Next button, keyboard, swipe, page corner and
  // every programmatic caller land here, so none of them can bypass the lock.
  // `animating` inside canNavigateForward() is also the double-tap guard: a
  // second tap during the turn is refused, so one tap can only ever move one page.
  if (!canNavigateForward()) return;
  animating = true;
  const leaf = leaves[flipped];                  // the page to turn
  flipped++;
  turnLeaf(leaf);
}
function goPrev() {
  if (!opened || !ready || animating) return;   // wait until the cover has fully opened
  // THE single backward gate — the Back button, ArrowLeft and the drag all land
  // here. It mirrors canNavigateForward()'s fullscreen lock, and it is not
  // optional: updateLbdOverlay() deliberately refuses to hide the overlay while
  // the game is fullscreen (you must never lose the game mid-play), so a page
  // turn that slipped through here would move the book UNDERNEATH a full-screen
  // game while the arrows are hidden by body.lbd-fullscreen — leaving
  // the reader behind a game that is now attached to the wrong page, with no
  // control to get out. ArrowLeft reached exactly that state before this guard.
  if (lbdFullscreen) return;
  if (flipped <= 0) return;               // already on the first page
  animating = true;
  flipped--;
  turnLeaf(leaves[flipped]);
}

/* ==========================================================================
   VIDEO GATE  —  one central forward-navigation guard.

   On every page that owns a video, forward navigation is locked when the page
   is entered and released by WHICHEVER OF THREE THINGS HAPPENS FIRST:
       1. the video's `ended` event       (the normal path)
       2. the video's `error` event       (bad/missing/undecodable source)
       3. a watchdog timer                (stalled forever, no event at all)
   A learner can therefore never be trapped by a video that fails to play.

   Watchdog budget = the clip's real duration + 4s once the duration is known,
   otherwise a flat 30s. Because preload="none", duration is usually unknown at
   arm time, so the watchdog is re-armed on `loadedmetadata`.

   The gate is armed on the FIRST entry to a page. Once that page's clip has been
   watched through it stays unlocked for the rest of the read, including when the
   reader comes back to it later — nobody is made to re-watch a video they have
   already seen. The previous page's timer is always cleared, so a stale timer can
   never unlock the wrong page.

   Pages that own no video (the LBD game page, THE END) are never gated by this
   logic. The game page is instead held by the LBD overlay, which advances the
   book itself on completion.
   ========================================================================== */
const GATE_SLACK_MS = 4000;      // duration + this much before the watchdog fires
const GATE_FALLBACK_MS = 30000;  // used when the duration is unknown
const gateTimers = {};           // page index -> watchdog timeout id

function pageOwnsVideo(i) {
  return !!(pages[i] && pages[i].type === "video");
}
function videoForPage(i) {
  return leaves[i] ? leaves[i].querySelector("video.page-media") : null;
}
function clearGateWatchdog(i) {
  if (gateTimers[i]) { clearTimeout(gateTimers[i]); delete gateTimers[i]; }
}
/* Release page i's forward gate. Idempotent — the first of the three paths wins. */
function releaseGate(i, why) {
  clearGateWatchdog(i);
  if (videoWatched[i]) return;
  videoWatched[i] = true;
  if (i === 0) { firstPageVideoCompleted = true; updateFirstPageNextArrow(); }
  updateProgress();
}
/* (Re)start the watchdog for page i using whatever duration we know right now. */
function armGateWatchdog(i) {
  clearGateWatchdog(i);
  if (videoWatched[i]) return;
  const v = videoForPage(i);
  const d = v && isFinite(v.duration) && v.duration > 0
    ? v.duration * 1000 + GATE_SLACK_MS
    : GATE_FALLBACK_MS;
  gateTimers[i] = setTimeout(function () { releaseGate(i, "watchdog"); }, d);
}
/* Lock page i on entry (or leave it open if the page owns no video). */
function armVideoGate(i) {
  // Clear every OTHER page's watchdog so a timer from a page we have left can
  // never release a gate on the page we are now on.
  Object.keys(gateTimers).forEach(function (k) { if (+k !== i) clearGateWatchdog(+k); });
  if (!pageOwnsVideo(i) || !videoForPage(i)) {
    videoWatched[i] = true;            // never lock a page that has no video
    if (i === 0) firstPageVideoCompleted = true;
    return;
  }
  // A page the reader has ALREADY watched through stays OPEN. Going back to
  // re-read an earlier page must not make them sit through its clip a second
  // time, so on any page already seen this read both arrows stay live and the
  // watchdog is not re-armed. (resetToStart() empties videoWatched, so starting
  // a fresh read from the cover still gates every page again.)
  if (videoWatched[i]) {
    if (i === 0) firstPageVideoCompleted = true;
    return;
  }
  videoWatched[i] = false;             // first visit to this page → gate it
  if (i === 0) firstPageVideoCompleted = false;
  armGateWatchdog(i);
}

/* Wire the two event release paths once per video, bound to a KNOWN page index
   (so a fired event can never be attributed to the wrong page). */
pages.forEach(function (page, i) {
  const v = videoForPage(i);
  if (!v) return;
  v.addEventListener("ended", function () { releaseGate(i, "ended"); });
  v.addEventListener("error", function () { releaseGate(i, "error"); });
  // A source that resolves but never decodes still ends up on the watchdog.
  v.addEventListener("stalled", function () { if (flipped === i) armGateWatchdog(i); });
  // Duration becomes known only after metadata loads (preload="none"), so this
  // is where the flat 30s fallback is replaced by duration + 4s.
  v.addEventListener("loadedmetadata", function () { if (flipped === i) armGateWatchdog(i); });
});

/* ---- THE one guard every forward route must consult ----------------------
   Next button, keyboard, swipe/drag, page corner, and any programmatic turn all
   go through this. Disabling only the visible button would leave the other
   routes wide open. */
function canNavigateForward() {
  if (!opened || !ready || animating) return false;
  if (lbdFullscreen) return false;             // never turn pages under the game
  if (flipped >= totalPages - 1) return false; // already on the last page
  if (flipped === 0 && !firstPageGatesClear()) return false;  // page 1 has extra gates
  // The GAME page owns its own exit: the book advances when the game reports
  // completion, never from a page turn, so the child cannot arrow past it.
  // UNLESS the game failed to load (lbdEscape) — then the gate opens, because a
  // broken game must never be a dead end. See the escape-hatch block above.
  if (flipped === LBD_INDEX && !lbdAdvancing && !lbdEscape) return false;
  return !!videoWatched[flipped];
}
// Kept as an alias: older call sites read better with this name.
function canGoForward() { return canNavigateForward(); }

/* ==========================================================================
   FIRST STORY PAGE  —  extra entry gates.

   Page 1 shows no Back control at all (it is display:none, not merely disabled)
   and shows no Next arrow until BOTH of these are true:
       firstPageVideoCompleted        — via ended / error / watchdog, as above
       firstPageInteractionCompleted  — the page's required activity
   Page 1 of this book has no required interaction, so that flag is permanently
   true (per spec: "If the first page contains no required interaction, treat
   firstPageInteractionCompleted = true"). If an activity is added later, set the
   flag from its genuine success callback only — starting it, or tapping a wrong
   area, must not count.
   ========================================================================== */
let firstPageVideoCompleted = false;
const FIRST_PAGE_HAS_INTERACTION = false;      // page 1 is video-only in this book
let firstPageInteractionCompleted = !FIRST_PAGE_HAS_INTERACTION;
// Has page 1's Next arrow already played its one-shot pop-in this read? Cleared by
// resetToStart() so a fresh read from the cover plays it again.
let firstNextPopped = false;

function completeFirstPageInteraction() {      // call ONLY on genuine success
  if (firstPageInteractionCompleted) return;
  firstPageInteractionCompleted = true;
  updateFirstPageNextArrow();
}
function firstPageGatesClear() {
  return firstPageVideoCompleted && firstPageInteractionCompleted;
}
function updateFirstPageNextArrow() {
  if (!cornerNext) return;
  const onFirstPage = opened && flipped === 0;
  document.body.classList.toggle("first-page", onFirstPage);
  const canShowNext = !onFirstPage || firstPageGatesClear();
  // On page 1 the arrow is absent (not faded) until both gates clear.
  document.body.classList.toggle("gate-hide-next", onFirstPage && !canShowNext);
  // .is-visible exists ONLY to play the 400ms pop-in as the arrow first appears,
  // so it is added once and then stripped. Leaving it on is not harmless: its rule
  // carries `animation: nextPopIn`, so as soon as any higher-priority animation
  // (the glow pulse) is removed the cascade falls back to nextPopIn and RE-RUNS
  // it — the arrow popped in a second time right after glowing. Dropping the class
  // once it has played leaves nothing to fall back to.
  const popNow = onFirstPage && canShowNext && !firstNextPopped;
  if (popNow) {
    firstNextPopped = true;
    cornerNext.classList.add("is-visible");
    setTimeout(function () { cornerNext.classList.remove("is-visible"); }, 460);
  } else if (!onFirstPage || !canShowNext) {
    cornerNext.classList.remove("is-visible");
  }
  cornerNext.setAttribute("aria-hidden", String(onFirstPage && !canShowNext));
}

/* ---- Nav state (page counter removed) ----------------------------------- */
function updateProgress() {
  // Back: disabled on the first available page. On page 1 CSS also removes it
  // entirely (body.first-page) — disabled here too so it is inert either way.
  if (cornerPrev) {
    cornerPrev.disabled = !ready || flipped <= 0;
    cornerPrev.setAttribute("aria-disabled", String(!ready || flipped <= 0));
  }
  // Next: disabled on the last page and until this page's video gate releases.
  if (cornerNext) {
    cornerNext.disabled = !canNavigateForward();
    cornerNext.setAttribute("aria-disabled", String(!canNavigateForward()));
  }
  // GAME PAGE: the forward arrow is REMOVED, not merely faded — the only way on
  // is to finish the game, which advances the book itself on lbd-complete. A
  // greyed-out arrow invites tapping; an absent one does not. The exception is
  // lbdEscape: if the game never loaded, the arrow comes back as the escape
  // hatch, because a broken game must never be a dead end.
  document.body.classList.toggle("lbd-hide-next",
    opened && flipped === LBD_INDEX && !lbdEscape);
  updateFirstPageNextArrow();
}

/* ---- Fullscreen: go FULLSCREEN when the book opens (the Play tap is the user
   gesture the Fullscreen API requires) and LEAVE fullscreen when back at the
   cover (Replay). Applies on every screen; silently no-ops where the
   browser blocks it (e.g. iPhone Safari can't fullscreen arbitrary elements). */
function enterFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
    if (req) { var p = req.call(el); if (p && p.catch) p.catch(function () {}); }
  } catch (_) {}
}
function exitFullscreen() {
  try {
    if (!(document.fullscreenElement || document.webkitFullscreenElement)) return;
    var ex = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.msExitFullscreen;
    if (ex) { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); }
  } catch (_) {}
}

/* ---- Open the 3D cover, then hand off to the page-turning book ----------
   Shared by the first open (openBook) AND Replay (replayBook), so the dramatic
   hinge-open + post-open setup are identical both times. */
function runOpenSequence() {
  ready = false;
  document.body.classList.remove("is-closing");
  document.body.classList.add("is-open");
  // The whole open motion IS the cover's own hinge — NO zoom / camera move.
  book.classList.remove("closing");
  book.classList.add("open");          // cover hinges open on the LEFT spine
  bookFloat.classList.add("rest");     // stop the idle bob
  coverScene.classList.remove("parked");
  flipbookEl.style.zIndex = "";        // cover ABOVE the pages while it swings open
  // Reveal the REAL page right away (it sits beneath the cover, masked by it).
  flipbookEl.classList.add("show");
  // A user gesture drives every open, so start audio here.
  soundOn();
  resumeAudio();
  playCoverFlip();
  primeVideo(0); primeVideo(1);         // unlock page 1 + 2 inside the gesture
  refreshMedia();                       // start the page-1 video right away
  // Once the cover has FULLY opened, park it, lift the pages above it, hand over
  // pointer events, and mark the book READY.
  clearTimeout(_openTimer);
  _openTimer = setTimeout(function () {
    coverScene.classList.add("parked");
    flipbookEl.style.zIndex = "5";        // pages now sit ABOVE the parked cover (z3)
    tapCatcher.style.pointerEvents = "none";
    flipbookEl.style.pointerEvents = "auto";
    ready = true;
    updateProgress();
    refreshMedia();
    resetIdleHint();
  }, COVER_OPEN_MS + 50);
  updateProgress();
}
/* THE single start gate. The play button is hidden while preloader.js is still
   fetching, but hiding a button only stops MOUSE starts — Enter/Space/ArrowRight
   and any programmatic call land here, so the wait is enforced in the function
   itself. Returns false when the start was refused. */
function assetsReady() {
  return !window.PRELOADER || window.PRELOADER.ready === true;
}
function openBook() {
  if (opened) return;
  if (!assetsReady()) return;   // still loading — keyboard/programmatic starts wait too
  opened = true;
  enterFullscreen();          // Play tap is a user gesture → allowed to go fullscreen
  runOpenSequence();
}

/* ---- Reset the whole book to the START SCREEN: the CLOSED FRONT COVER + Play
   button, exactly like a fresh load (so tapping Play reads from the top). Shared
   by Replay (called once the closing swing has finished). ---------------- */
function resetToStart() {
  exitFullscreen();           // back at the cover → leave fullscreen
  ready = false; opened = false; flipped = 0;
  renderLeaves();
  leaves.forEach(function (leaf) {
    var vv = leaf.querySelector("video.page-media");
    if (vv) { try { vv.pause(); vv.currentTime = 0; } catch (_) {} }
  });
  lastMediaIdx = -1;
  // Fresh read → every page's video must play out again before Next unlocks,
  // and page 1's own gates go back to their starting state. Clearing the
  // watchdogs here stops a timer armed on the old visit from unlocking a page
  // after the book has been reset.
  videoWatched.length = 0;
  Object.keys(gateTimers).forEach(function (k) { clearGateWatchdog(+k); });
  firstPageVideoCompleted = false;
  firstPageInteractionCompleted = !FIRST_PAGE_HAS_INTERACTION;
  firstNextPopped = false;                     // page 1's Next pops in again next read
  if (cornerNext) cornerNext.classList.remove("is-visible", "glow-pulse");
  updateFirstPageNextArrow();
  document.body.classList.remove("is-open", "is-closing");
  book.classList.remove("open", "closing");
  coverScene.classList.remove("parked");
  cover.style.transform = "";                 // cover CLOSED → front cover + Play button showing
  flipbookEl.classList.remove("show");         // pages hidden behind the closed cover
  flipbookEl.style.zIndex = "";
  flipbookEl.style.pointerEvents = "none";
  bookFloat.classList.remove("rest");          // resume the idle bob
  tapCatcher.style.pointerEvents = "auto";     // Play is tappable again
  hideFlipHint(); clearTimeout(idleHintTimer); clearTimeout(nudgeHideTimer);
  // The game overlay lives at BODY level, so closing the book does not hide it:
  // it is not a descendant of anything reset above. Replay also reaches
  // the cover WITHOUT going through refreshMedia() (this function calls
  // renderLeaves() only), so updateLbdOverlay() never runs on these paths —
  // without this line, leaving the game page via Replay would leave the game
  // sitting on top of the front cover, still playing.
  hideLbdOverlay();
  updateProgress();                            // hides the progress read-out (not opened)
}

/* ---- CLOSE THE BOOK: the cover swings SHUT — the exact REVERSE of the opening
   hinge (cover −180 → 0) — and the book lands on the front cover. Used by
   (while reading) and REPLAY (from THE END page). `afterReset` runs once we're
   back on the cover. ------------------------------------------------------ */
function closeBookToCover(afterReset) {
  ready = false;                               // block flips during the close
  clearTimeout(_openTimer);
  clearTimeout(_homeTimer);
  hideFlipHint(); clearTimeout(idleHintTimer); clearTimeout(nudgeHideTimer);
  // Drop the game NOW, at the start of the close — not in resetToStart(), which
  // runs on the _homeTimer two whole seconds later (COVER_CLOSE_MS). Leaving it
  // until then would keep the game sitting over the book for the entire closing
  // swing, still making sound. "Leaving the game page kills its audio instantly"
  // has to mean the instant the reader asks to leave.
  hideLbdOverlay();
  if (cornerNext) cornerNext.classList.remove("blink", "glow-pulse");
  var v = currentVideo(); if (v) { try { v.pause(); } catch (_) {} }
  // pages back UNDER the cover, so the closing cover sweeps over them
  flipbookEl.style.zIndex = "";
  flipbookEl.style.pointerEvents = "none";
  tapCatcher.style.pointerEvents = "none";
  coverScene.classList.remove("parked");
  // CLOSE — reverse of the opening hinge (cover swings from -180 back to 0).
  // is-closing keeps the current page bright (hides the dark thickness block) and
  // hides the turned-page pile, so the cover folds cleanly with no stray left page.
  document.body.classList.add("is-closing");
  book.classList.remove("open");
  book.classList.add("closing");
  playCoverFlip();
  _homeTimer = setTimeout(function () {
    resetToStart();
    if (typeof afterReset === "function") afterReset();
  }, COVER_CLOSE_MS + 60);
}

/* ---- REPLAY (button on THE END page): close the book with the reverse-of-open
   swing, land on the front cover, and re-arm the title VO for another read. */
function replayBook() {
  if (!opened || animating) return;
  closeBookToCover();
}

/* (goHome() was removed with the HOME button — it was its only caller. Replay on
   THE END page is now the single route back to the front cover; it shares
   closeBookToCover() / resetToStart(), which are both still live.) */

/* ==========================================================================
   INPUT  —  tap PLAY to OPEN the cover; once open, drag + corner arrows +
   keyboard drive the page flip.
   ========================================================================== */
const tapCatcher = document.getElementById("tapCatcher");

// The book opens ONLY from the play button. The tap-catcher still sits on top to
// block page gestures before opening, but it opens the book only when the tap
// lands inside the play button's (breathing) hit-circle — taps elsewhere on the
// cover do nothing.
function tapHitsPlay(e) {
  const r = hint.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const rad = Math.max(r.width, r.height) / 2;
  return Math.hypot(e.clientX - cx, e.clientY - cy) <= rad;
}
if (tapCatcher) tapCatcher.addEventListener("click", function (e) { if (!opened && tapHitsPlay(e)) openBook(); });
// Show the hand (pointer) cursor ONLY when hovering the play button — the sole CTA
// on the cover. Everywhere else on the tap surface stays a normal cursor.
if (tapCatcher) tapCatcher.addEventListener("mousemove", function (e) {
  tapCatcher.style.cursor = (!opened && tapHitsPlay(e)) ? "pointer" : "default";
});

// The play button itself (also covers keyboard: Enter/Space on the focused button).
hint.addEventListener("click", function (e) { e.stopPropagation(); if (!opened) openBook(); });

// Bottom-corner flip arrows (outside the book): back = left, forward = right.
cornerPrev.addEventListener("click", function (e) { e.stopPropagation(); goPrev(); this.blur(); });
cornerNext.addEventListener("click", function (e) { e.stopPropagation(); goNext(); this.blur(); });
if (replayBtn) replayBtn.addEventListener("click", function (e) { e.stopPropagation(); replayBook(); this.blur(); });

// Page interaction — DRAG TO TURN: grab the page and it follows your cursor,
// rotating about the spine, then SNAPS to the nearest state when you let go.
//   • drag LEFT  → turn the current page forward (it comes to rest on the cover)
//   • drag RIGHT → turn the previous page back
// A plain tap does nothing; the corner arrows + keyboard still work.
(function () {
  let startX = 0, startY = 0, pw = 1;
  let leaf = null, dir = 0, decided = false, dragging = false, curlEl = null;
  let lastX = 0, lastT = 0, vx = 0;                   // for flick (velocity) detection
  const DECIDE = 6;                                   // px before we commit to a drag
  const FLICK = 0.45;                                 // px/ms — a quick flick completes the turn
  const FINISH_DEG = 45;                              // turned this far (deg) → completes on release

  // how many degrees the drag has turned the page (0..180)
  function degFromDx(dx) { return Math.max(0, Math.min(180, Math.abs(dx) / pw * 180)); }
  // the live angle for the active leaf, given the raw horizontal travel
  function liveAngle(dx) {
    return (dir === 1) ? degFromDx(Math.min(0, dx))          // forward: leftward turns 0→180
                       : 180 - degFromDx(Math.max(0, dx));   // back: starts at 180, rightward → 0
  }

  flipbookEl.addEventListener("pointerdown", function (e) {
    if (!opened || !ready || animating) return;
    startX = e.clientX; startY = e.clientY;
    lastX = e.clientX; lastT = e.timeStamp || performance.now(); vx = 0;
    decided = false; dragging = true; leaf = null; dir = 0; curlEl = null;
    pw = flipbookEl.getBoundingClientRect().width || 1;
  });

  flipbookEl.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    const now = e.timeStamp || performance.now();
    const dt = now - lastT;
    if (dt > 0) vx = (e.clientX - lastX) / dt;         // running horizontal velocity
    lastX = e.clientX; lastT = now;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < DECIDE || Math.abs(dx) <= Math.abs(dy)) return;   // wait for a clear horizontal drag
      if (dx < 0 && canNavigateForward())      { dir = 1;  leaf = leaves[flipped]; }     // swipe/drag forward obeys the same gate as the button
      else if (dx > 0 && flipped > 0)         { dir = -1; leaf = leaves[flipped - 1]; } // turn back
      else { dragging = false; return; }                  // nothing to turn that way
      decided = true;
      leaf.style.transition = "none";                     // follow the finger exactly
      leaf.style.zIndex = 300;
      curlEl = leaf.querySelector(".curl");
      try { flipbookEl.setPointerCapture(e.pointerId); } catch (_) {}
    }
    const ang = Math.max(0, Math.min(180, liveAngle(dx)));
    leaf.style.transform = "rotateY(" + (-ang) + "deg)";
    if (curlEl) curlEl.style.opacity = (ang <= 90 ? ang / 90 : (180 - ang) / 90) * 0.9;
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    const L = leaf, D = dir, C = curlEl;
    leaf = null; curlEl = null;
    if (!decided || !L) return;                           // a plain tap → nothing

    const ang = Math.max(0, Math.min(180, liveAngle(e.clientX - startX)));
    // Complete the turn if it's been dragged far enough OR flicked quickly in
    // the turn's direction — no need to drag all the way past halfway.
    const flick = (D === 1) ? (vx < -FLICK) : (vx > FLICK);
    const complete   = (D === 1) ? (ang > FINISH_DEG || flick)
                                 : (ang < 180 - FINISH_DEG || flick);
    const endFlipped = (D === 1) ? complete   : !complete;    // does this leaf end up turned?

    animating = true;
    if (C) C.style.opacity = "";
    if (complete) { playFlip(); flipped += (D === 1) ? 1 : -1; }
    // Lock in the resting classes + z-index NOW (so nothing pops in later), then
    // animate the inline transform from the dragged angle to the target. The
    // .flipped class already holds the same final angle underneath.
    L.style.transition = "";                              // restore the CSS flip transition
    void L.offsetWidth;                                   // reflow so it animates FROM the dragged angle
    L.classList.add("flipping");                          // curl shading during the snap
    renderLeaves();                                       // apply .flipped + z-index immediately
    refreshMedia();                                       // START the target video INSTANTLY
    L.style.transform = endFlipped ? "rotateY(-180deg)" : "rotateY(0deg)";
    updateProgress();

    setTimeout(function () {
      L.classList.remove("flipping");
      // Drop the inline transform WITHOUT re-animating: the .flipped class already
      // holds the final angle, so disabling the transition for this swap prevents
      // the leaf from briefly swinging back (the "page reappears on the left" glitch).
      L.style.transition = "none";
      L.style.transform = "";
      void L.offsetWidth;                                 // commit with no transition
      L.style.transition = "";                            // restore for the next turn
      animating = false; updateProgress();
      refreshMedia();                                     // re-assert once settled (idempotent safety net)
    }, FLIP_MS + 40);
  }
  flipbookEl.addEventListener("pointerup", endDrag);
  flipbookEl.addEventListener("pointercancel", endDrag);
})();

window.addEventListener("keydown", function (e) {
  if (e.key === "ArrowRight") { e.preventDefault(); if (!opened) openBook(); else goNext(); }   // goNext() self-guards via canNavigateForward()
  else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
  else if ((e.key === " " || e.key === "Enter") && !opened) { e.preventDefault(); openBook(); }
});

// Keep the canvas scaled to fit on resize / rotate.
let _resizeSettle = null;
function onViewportChange() {
  // Suppress the page-turn transitions while the viewport is actively changing, so
  // a rapid resize / resolution change can't make the book LOOK like it's auto-
  // flipping (the leaves re-render during the scale change). Restored once settled.
  document.body.classList.add("is-resizing");
  clearTimeout(_resizeSettle);
  _resizeSettle = setTimeout(function () { document.body.classList.remove("is-resizing"); }, 220);
  fitScale();
  // Re-park the LBD overlay over the (re-scaled) page — unless it's fullscreen,
  // where it already fills the viewport via CSS.
  if (lbdStage && lbdStage.classList.contains("visible") && !lbdFullscreen) positionLbdStage();
}
window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", onViewportChange);

/* ---- Block ALL zoom (pinch, double-tap, ctrl+wheel, ctrl +/-) ------------
   The book is fixed-layout, so zoom would only break it. */
(function () {
  // Never let anything (esp. page images) start a native HTML5 drag — that was
  // showing a "ghost" of the image following the cursor during a page-flip drag.
  document.addEventListener("dragstart", function (e) { e.preventDefault(); });
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) {   // iOS pinch
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
  });
  window.addEventListener("wheel", function (e) {                          // desktop ctrl+wheel
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });
  window.addEventListener("keydown", function (e) {                        // ctrl/⌘ +/-/0
    if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].indexOf(e.key) !== -1) e.preventDefault();
    // Block "Save page" (Ctrl/⌘+S) — a casual way to grab the media.
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) e.preventDefault();
  });
  document.addEventListener("touchmove", function (e) {                    // 2-finger pinch
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // NOTE: the right-click / context menu is intentionally LEFT ENABLED (so "Inspect"
  // and dev tools work). Casual image protection still stands via CSS — no drag,
  // no text-selection, no iOS long-press "Save Image" callout — plus Ctrl+S is blocked.
})();

/* ==========================================================================
   SOUND  —  the two one-shot SFX (page flip, cover flip) are decoded from the
   inlined Ogg/Opus base64 in sfx-data.js and played through Web Audio, with
   plain <audio> elements as a fallback. All muted until the book is opened
   (a user gesture).

   Title voice-over: INTENTIONALLY ABSENT. This build referenced
   sfx/the story night.ogg — a file that has never existed here (it is a leftover
   from the earlier "The Story Night" book), so the request 404'd on every load
   and no voice-over ever played. The dead reference and its first-gesture
   autoplay fallback are removed rather than kept as a guaranteed failed request.
   ========================================================================== */
let muted = true;

/* ---- Background music: INTENTIONALLY ABSENT --------------------------------
   This build shipped a reference to sfx/BG Music.mp3, but that file has never
   existed in the project — every load 404'd and the loop never played. The dead
   reference is removed rather than kept as a guaranteed failed request. To bring
   the music back, drop the file in sfx/, convert it to Ogg/Opus and restore a
   looping <audio> here plus the playBgMusic() calls in runOpenSequence()/
   resumeAllAudioFB() and the stop in resetToStart(). */

/* ---- Pause ALL audio when the tab / window goes to the background -----------
   Background music AND the current page's video (its voice-over) must stop the
   moment the reader switches tab or app, and resume when they come back — they
   were continuing to play in the background. Covers visibilitychange (tab switch),
   blur (other window), and pagehide (mobile app switch / bfcache). */
function currentVideo() {
  const leaf = leaves[flipped];
  return leaf ? leaf.querySelector("video.page-media") : null;
}
function pauseAllAudioFB() {
  const v = currentVideo();
  if (v && !v.paused) { v.dataset.wasPlaying = "1"; try { v.pause(); } catch (_) {} }
  if (audioCtx && audioCtx.state === "running") { try { audioCtx.suspend(); } catch (_) {} }
}
function resumeAllAudioFB() {
  if (document.hidden || !document.hasFocus()) return;   // only when truly back in front
  if (!opened) return;                                   // nothing plays before the book opens
  if (audioCtx && audioCtx.state === "suspended") { try { audioCtx.resume(); } catch (_) {} }
  const v = currentVideo();
  if (v && v.dataset.wasPlaying && !v.ended) { delete v.dataset.wasPlaying; const p = v.play(); if (p && p.catch) p.catch(function () {}); }
}
document.addEventListener("visibilitychange", function () {
  if (document.hidden) pauseAllAudioFB(); else resumeAllAudioFB();
});
window.addEventListener("blur", pauseAllAudioFB);
window.addEventListener("focus", resumeAllAudioFB);
window.addEventListener("pagehide", pauseAllAudioFB);

/* ---- One-shot SFX via Web Audio (glitch-free, zero-latency) --------------
   An <audio> element pays a real first-play init cost and can stutter on short
   one-shots — that was the cover-flip "lag/glitch". Instead we decode each SFX
   ONCE into an AudioBuffer and play it through a BufferSource: sample-accurate,
   no start latency. Any leading silence baked into the mp3 is auto-skipped (we
   start on the first audible sample). Buffers come from base64 data URIs
   (window.SFX_DATA in sfx-data.js) so they decode even on file://, where fetch()
   of a plain path is blocked. If Web Audio is unavailable we fall back to plain
   <audio> elements (the old behaviour). */
let audioCtx = null;
const sfxBuf = {};                          // name -> { buffer, offset (seconds) }

// Fallback <audio> elements — used ONLY if Web Audio fails to init or decode.
// Rarely used: the Web Audio path above serves these SFX from inlined base64 on
// every supported browser, so these elements only ever load if decoding fails.
const flipSound = new Audio("sfx/Page%20flip.ogg");
flipSound.preload = "none";
const coverFlipSound = new Audio("sfx/cover%20page%20flip.ogg");
coverFlipSound.preload = "none";
coverFlipSound.volume = 0.35;

(function initSfx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const DATA = window.SFX_DATA || {};
  if (!AC || !DATA.cover) return;           // no Web Audio / no inlined data → fallback
  try { audioCtx = new AC(); } catch (_) { audioCtx = null; return; }
  function decode(name, uri) {
    fetch(uri).then(function (r) { return r.arrayBuffer(); })
      .then(function (a) { return audioCtx.decodeAudioData(a); })
      .then(function (buf) {
        // Skip any leading silence so playback starts right on the transient.
        const ch = buf.getChannelData(0), sr = buf.sampleRate, thr = 0.008;
        let first = 0;
        for (let i = 0; i < ch.length; i++) { if (Math.abs(ch[i]) > thr) { first = i; break; } }
        sfxBuf[name] = { buffer: buf, offset: Math.max(0, first / sr - 0.004) };
      })
      .catch(function () {});               // leave name unset → falls back to <audio>
  }
  decode("cover", DATA.cover);
  decode("flip", DATA.flip);
})();

// The audio context starts suspended until a user gesture. Resume it on the first
// pointer press (fires just BEFORE the open click) so the cover-flip sound, played
// a moment later, is instant. Capture phase, not once (cheap + always safe).
function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended") { try { audioCtx.resume(); } catch (_) {} }
}
document.addEventListener("pointerdown", resumeAudio, { capture: true });

// Play a decoded SFX buffer; returns false if Web Audio isn't ready (→ caller
// falls back to the <audio> element).
function playSfx(name, vol, rate) {
  const entry = sfxBuf[name];
  if (!audioCtx || !entry) return false;
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = entry.buffer;
    if (rate) src.playbackRate.value = rate;
    const g = audioCtx.createGain();
    g.gain.value = (vol == null ? 1 : vol);
    src.connect(g).connect(audioCtx.destination);
    src.start(0, entry.offset || 0);        // start on the first audible sample
    return true;
  } catch (_) { return false; }
}

// Page-flip sound — snappy 1.5× on every ordinary flip.
function playFlip() {
  if (muted) return;                        // sound turns on when the book opens
  if (playSfx("flip", 1.0, 1.5)) return;    // Web Audio path
  try {                                     // fallback
    flipSound.currentTime = 0; flipSound.playbackRate = 1.5;
    const p = flipSound.play(); if (p && p.catch) p.catch(function () {});
  } catch (_) {}
}
// COVER-page flip sound — played ONLY when the cover opens (never on page flips).
function playCoverFlip() {
  if (muted) return;
  if (playSfx("cover", 0.35)) return;       // Web Audio path
  try {                                     // fallback
    coverFlipSound.currentTime = 0;
    const p = coverFlipSound.play(); if (p && p.catch) p.catch(function () {});
  } catch (_) {}
}
// Turn sound ON when the book is opened (a clear user gesture). Safe to call
// repeatedly.
function soundOn() {
  muted = false;                     // opening the book turns sound on
}


/* ==========================================================================
   PAGE-TURN HINT  —  guidance for readers who don't know how to turn the page.
   When idle, two cues fire together: a hand taps the forward arrow AND the page
   itself does a "ghost" half-flip (lifts toward the next page, then falls back).
   Timing: PAGE 1 after 5s, every later page after 10s of no interaction; repeats
   while idle and is cancelled by any tap / key / flip. Never on the last page or
   while the LBD game is open.
   ========================================================================== */
// The nudge is a HAND on the RIGHT side of the book. This used to load
// assets/hand-nudge.png and fall back to an emoji via the <img> error handler —
// but that art has never existed in the project, so every load spent a real 404
// to reach the fallback. The emoji hand is now the direct, zero-request default.
// To use custom art instead, add the image to assets/ and swap this for an <img>.
let flipHint = document.createElement("div");
flipHint.className = "flip-hint flip-hint--emoji";
flipHint.setAttribute("aria-hidden", "true");
flipHint.textContent = "👆";
document.body.appendChild(flipHint);

// Guidance timing: the page-turn tutorial appears ONLY after the current page's
// video has FINISHED, and then 5s later (never while the clip is still playing).
// It plays ONCE, disappears, and comes back every 9s while idle. Any interaction
// resets the 5s countdown; landing on a new page hides it until that video ends.
const POST_VIDEO_HINT_MS = 5000;   // wait 5s after the video ends before the first nudge
const NUDGE_SHOW_MS = 2000;    // how long one nudge stays on screen
const NUDGE_GAP_MS  = 9000;    // gap after it disappears before it plays again
let idleHintTimer = null;
let nudgeHideTimer = null;
let peeking = false;
let peekTimers = [];

function canShowHint() {
  return opened && ready && !animating && !lbdFullscreen &&
         flipped < totalPages - 1 && flipped !== LBD_INDEX && !document.hidden;
}
function positionFlipHint() {
  if (!flipScaleEl) return;
  const r = flipScaleEl.getBoundingClientRect();            // the book's on-screen rect
  const w = flipHint.offsetWidth || 80, h = flipHint.offsetHeight || 80;
  // Park the hand against the book's RIGHT edge, vertically centred — the side the
  // ghost flip lifts. The swipe animation moves it right→left from here.
  flipHint.style.left = Math.round(r.right - w - r.width * 0.05) + "px";
  flipHint.style.top  = Math.round(r.top + r.height * 0.5 - h / 2) + "px";
}
function showFlipHint() {
  if (!canShowHint()) return;
  positionFlipHint();
  flipHint.classList.add("show");
}
function hideFlipHint() {
  flipHint.classList.remove("show");
}

/* ---- GHOST PAGE-FLIP -------------------------------------------------------
   Lift the current page about halfway toward the next one, then let it fall back
   — a live demo that the page turns. Purely visual; cancelled the instant the
   reader interacts, so a real drag/flip takes over cleanly. */
function cancelPeek() {
  peekTimers.forEach(clearTimeout);
  peekTimers = [];
  if (!peeking) return;
  peeking = false;
  const leaf = leaves[flipped];
  if (leaf) {
    leaf.style.transition = ""; leaf.style.transform = ""; leaf.style.zIndex = "";
    const c = leaf.querySelector(".curl"); if (c) c.style.opacity = "";
  }
  updateZ();
}
function peekFlip() {
  if (peeking || !canShowHint()) return;
  const leaf = leaves[flipped];
  if (!leaf) return;
  peeking = true;
  const curl = leaf.querySelector(".curl");
  leaf.style.zIndex = 300;                               // lift above the rest while peeking
  leaf.style.transition = "transform 720ms cubic-bezier(0.33, 0, 0.2, 1)";
  void leaf.offsetWidth;                                 // commit so the lift animates from flat
  leaf.style.transform = "rotateY(-52deg)";              // turn toward the next page (~halfway)
  if (curl) curl.style.opacity = "0.85";                 // page-curl shading during the lift
  peekTimers.push(setTimeout(function () {               // ...then ease it back down
    leaf.style.transform = "rotateY(0deg)";
    if (curl) curl.style.opacity = "";
  }, 760));
  peekTimers.push(setTimeout(function () {               // clean up once settled
    leaf.style.transition = ""; leaf.style.transform = ""; leaf.style.zIndex = "";
    peeking = false; updateZ();
  }, 760 + 760));
}

// Play the nudge ONCE — hand swipe on the book's right + ghost page-flip + the
// right arrow blinks — hold ~2s, then hide and come back 9s later. Repeats while idle.
function triggerHint() {
  if (!hintArmed) return;                                     // video not finished yet → never show
  if (!canShowHint()) { idleHintTimer = setTimeout(triggerHint, NUDGE_GAP_MS); return; }
  showFlipHint();
  peekFlip();
  if (cornerNext) cornerNext.classList.add("blink");
  clearTimeout(nudgeHideTimer);
  nudgeHideTimer = setTimeout(function () {
    hideFlipHint();
    if (cornerNext) cornerNext.classList.remove("blink");
    idleHintTimer = setTimeout(triggerHint, NUDGE_GAP_MS);   // ...then again after 9s
  }, NUDGE_SHOW_MS);
}
// Called from a page's video 'ended' handler: the tutorial is now allowed — show
// the first nudge 5s from now (unless the reader interacts / turns the page first).
function armHintAfterVideo() {
  hintArmed = true;
  hideFlipHint(); cancelPeek();
  if (cornerNext) cornerNext.classList.remove("blink");
  clearTimeout(idleHintTimer); clearTimeout(nudgeHideTimer);
  idleHintTimer = setTimeout(triggerHint, POST_VIDEO_HINT_MS);
}
function resetIdleHint() {
  hideFlipHint();
  cancelPeek();
  if (cornerNext) cornerNext.classList.remove("blink");
  clearTimeout(idleHintTimer);
  clearTimeout(nudgeHideTimer);
  // Only (re)start the countdown once the page's video has finished. Until then the
  // tutorial stays hidden; the video 'ended' handler arms it (armHintAfterVideo).
  if (hintArmed) idleHintTimer = setTimeout(triggerHint, POST_VIDEO_HINT_MS);
}
// Any interaction cancels the nudge + restarts the idle countdown.
["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (evt) {
  document.addEventListener(evt, resetIdleHint, { passive: true, capture: true });
});

/* ---- Boot ---------------------------------------------------------------- */
fitScale();                              // scale the fixed 1280x720 book to fit first
renderLeaves();                          // lay out the leaves (all on page 1 to start)
updateProgress();
// The leaves above were built AFTER preloader.js started, so hand them to the
// preloader now: any asset already fetched is swapped to its blob: URL (with the
// one-time revert-on-error guard), and anything still in flight is swapped as it
// lands. Harmless when the preloader is absent or already finished.
if (window.PRELOADER) window.PRELOADER.adoptAll();
