/* ------------------------------------------------------------------
   Infinite draggable photo canvas.

   How it works: every photo is placed once inside a single tile
   (TILE_W x TILE_H). That tile is stamped into a lattice just big
   enough to cover the viewport plus one tile in each direction.
   Panning moves the whole lattice with one transform, and the offset
   is taken modulo the tile size — so when you drag past a tile
   boundary the offset wraps to an identical arrangement and the seam
   is invisible. You can pan forever without running out of photos.
------------------------------------------------------------------ */

(function () {
  'use strict';

  var CELL_W = 480;    // layout grid — one photo per cell, jittered.
  var CELL_H = 400;    // Bigger cells = fewer frames in view at once.
  var COLS = 7;
  var ROWS = 7;        // 49 cells for 44 photos, so a few stay empty
  var SEED = 20260809;

  var FRICTION = 0.94; // inertia decay per frame after you let go
  var MIN_V = 0.05;    // below this, the glide stops
  var EASE = 0.085;    // how hard the canvas chases the pointer — lower is laggier

  var TILE_W = COLS * CELL_W;
  var TILE_H = ROWS * CELL_H;

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('canvas');
  var hint = document.getElementById('hint');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- deterministic randomness -------------------------------------
     A fixed seed means the arrangement is identical on every visit and
     every device, so the layout can actually be art-directed. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rnd = mulberry32(SEED);

  /* --- build the tile ---------------------------------------------- */
  var cells = [];
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) cells.push([c, r]);
  }
  // Fisher-Yates, seeded
  for (var i = cells.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var tmp = cells[i]; cells[i] = cells[j]; cells[j] = tmp;
  }

  var layout = window.PHOTOS.map(function (photo, idx) {
    var cell = cells[idx % cells.length];
    var w = photo.p ? 185 + rnd() * 55 : 250 + rnd() * 90;
    var h = photo.p ? w * (4 / 3) : w * (3 / 4);

    // Centre in the cell, then jitter. The jitter is wide enough that
    // frames occasionally overlap, which is what stops it reading as a grid.
    var x = cell[0] * CELL_W + (CELL_W - w) / 2 + (rnd() - 0.5) * CELL_W * 0.42;
    var y = cell[1] * CELL_H + (CELL_H - h) / 2 + (rnd() - 0.5) * CELL_H * 0.42;

    return { src: photo.src, x: x, y: y, w: w, h: h, z: 1 + Math.floor(rnd() * 20) };
  });

  /* --- lattice ------------------------------------------------------
     On a phone the frames would otherwise fill the whole screen, so the
     entire field is scaled down with a CSS transform. Positions stay in
     tile units; only the wrap period has to account for the scale. */
  var nx = 0, ny = 0, scale = 1;

  function scaleFor() { return window.innerWidth < 700 ? 0.6 : 1; }
  function tileW() { return TILE_W * scale; }
  function tileH() { return TILE_H * scale; }

  function buildLattice() {
    scale = scaleFor();
    var wantX = Math.ceil(window.innerWidth / tileW()) + 1;
    var wantY = Math.ceil(window.innerHeight / tileH()) + 1;
    if (wantX === nx && wantY === ny) return;

    nx = wantX; ny = wantY;
    var frag = document.createDocumentFragment();

    for (var gy = 0; gy < ny; gy++) {
      for (var gx = 0; gx < nx; gx++) {
        for (var k = 0; k < layout.length; k++) {
          var it = layout[k];
          var fig = document.createElement('figure');
          fig.style.left = (it.x + gx * TILE_W) + 'px';
          fig.style.top = (it.y + gy * TILE_H) + 'px';
          fig.style.width = it.w + 'px';
          fig.style.height = it.h + 'px';
          fig.style.zIndex = it.z;

          var img = document.createElement('img');
          img.src = 'photos/' + it.src;
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.draggable = false;

          fig.appendChild(img);
          frag.appendChild(fig);
        }
      }
    }

    canvas.textContent = '';
    canvas.appendChild(frag);
  }

  /* --- panning ------------------------------------------------------ */
  /* Input moves `target`. What's actually drawn, `cur`, eases toward it
     every frame — that gap is the weight you feel when dragging. On
     release the leftover velocity keeps pushing `target` while friction
     eats it, so the field coasts to a stop instead of snapping. */
  var targetX = -TILE_W * 0.18;   // opening view
  var targetY = -TILE_H * 0.12;
  var curX = targetX, curY = targetY;
  var vx = 0, vy = 0;
  var dragging = false, pointerId = null;
  var lastX = 0, lastY = 0;
  var raf = null;

  var ease = reduceMotion ? 1 : EASE;

  function mod(n, m) { return ((n % m) + m) % m; }

  function apply() {
    var w = tileW(), h = tileH();
    canvas.style.transform =
      'translate3d(' + (mod(curX, w) - w) + 'px,' +
                       (mod(curY, h) - h) + 'px,0) scale(' + scale + ')';
  }

  function tick() {
    if (!dragging) {
      targetX += vx; targetY += vy;
      vx *= FRICTION; vy *= FRICTION;
      if (Math.abs(vx) < MIN_V) vx = 0;
      if (Math.abs(vy) < MIN_V) vy = 0;
    }

    var dx = targetX - curX;
    var dy = targetY - curY;
    curX += dx * ease;
    curY += dy * ease;
    apply();

    if (dragging || vx || vy || Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      raf = requestAnimationFrame(tick);
    } else {
      curX = targetX; curY = targetY;
      apply();
      raf = null;
    }
  }

  function kick() {
    if (raf === null) raf = requestAnimationFrame(tick);
  }

  function nudge(dx, dy) {
    targetX += dx; targetY += dy;
    kick();
    dismissHint();
  }

  stage.addEventListener('pointerdown', function (e) {
    if (document.body.classList.contains('overlay-open')) return;
    dragging = true;
    pointerId = e.pointerId;
    stage.setPointerCapture(pointerId);
    lastX = e.clientX; lastY = e.clientY;
    vx = vy = 0;
    stage.classList.add('dragging');
    dismissHint();
    kick();
  });

  stage.addEventListener('pointermove', function (e) {
    if (!dragging || e.pointerId !== pointerId) return;
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    targetX += dx; targetY += dy;
    // Smooth the velocity a little so a jittery last frame doesn't
    // throw the coast off in a random direction.
    vx = vx * 0.2 + dx * 0.8;
    vy = vy * 0.2 + dy * 0.8;
  });

  function endDrag(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    dragging = false;
    stage.classList.remove('dragging');
    if (pointerId !== null && stage.hasPointerCapture(pointerId)) {
      stage.releasePointerCapture(pointerId);
    }
    pointerId = null;
    if (reduceMotion) { vx = vy = 0; }
    kick();
  }

  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // Trackpad / wheel panning — the natural gesture on a Mac.
  stage.addEventListener('wheel', function (e) {
    if (document.body.classList.contains('overlay-open')) return;
    e.preventDefault();
    nudge(-e.deltaX, -e.deltaY);
  }, { passive: false });

  var KEYS = { ArrowLeft: [110, 0], ArrowRight: [-110, 0], ArrowUp: [0, 110], ArrowDown: [0, -110] };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeOverlay(); return; }
    if (document.body.classList.contains('overlay-open')) return;
    var k = KEYS[e.key];
    if (!k) return;
    e.preventDefault();
    nudge(k[0], k[1]);
  });

  function dismissHint() {
    if (hint && !hint.classList.contains('gone')) hint.classList.add('gone');
  }

  /* --- overlays ----------------------------------------------------- */
  var current = null;
  var lastFocus = null;
  var closeTimer = null;

  function openOverlay(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

    lastFocus = document.activeElement;
    current = el;
    el.hidden = false;
    document.body.classList.add('overlay-open');
    // Let the browser register the un-hidden element before transitioning.
    requestAnimationFrame(function () { el.classList.add('open'); });

    var close = el.querySelector('.overlay__close');
    if (close) close.focus();
  }

  function closeOverlay() {
    if (!current) return;
    var el = current;
    current = null;
    el.classList.remove('open');
    document.body.classList.remove('overlay-open');
    closeTimer = setTimeout(function () { el.hidden = true; closeTimer = null; }, 400);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  document.querySelectorAll('[data-overlay]').forEach(function (btn) {
    btn.addEventListener('click', function () { openOverlay(btn.dataset.overlay); });
  });

  document.querySelectorAll('.overlay').forEach(function (el) {
    el.addEventListener('click', function (e) {
      // Click the scrim (or the close button) to dismiss.
      if (e.target === el || e.target.classList.contains('overlay__close')) closeOverlay();
    });
  });

  // Keep tabbing inside an open overlay.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !current) return;
    var focusable = current.querySelectorAll('button, a[href]');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* --- go ----------------------------------------------------------- */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      // Crossing the phone breakpoint changes the scale, which changes
      // how many tiles are needed — force the lattice to be rebuilt.
      if (scaleFor() !== scale) nx = ny = 0;
      buildLattice();
      apply();
    }, 150);
  });

  buildLattice();
  apply();
})();
