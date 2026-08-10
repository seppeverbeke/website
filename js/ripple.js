// ==========================================================================
// Dot-grid ripple — reusable interaction (signature detail).
//
// Generates a wave of highlighted dots radiating outward from a given
// origin point, overlaid on top of an existing dot-grid background (see the
// .dot-grid utility in style.css, plus .cta-banner--dots which uses the same
// 22px grid). Exposes a single shared function, window.triggerRipple, used
// from two independent triggers (see main.js and contact.html):
//   1. Clicking the lavender dot in the "seppeverbeke." wordmark.
//   2. A successful contact-form submission.
// Both call this exact function rather than duplicating any ripple logic.
// ==========================================================================
(function (window, document) {
  var GRID_SIZE = 22; // must match the dot-grid background-size in style.css
  var DOT_OFFSET = GRID_SIZE / 2; // radial-gradient dot centers sit at the tile center
  var MS_PER_PX = 2.3; // distance-based per-dot delay
  var MAX_DELAY_MS = 900; // safety cap so far-corner dots don't wait forever
  var DOT_ANIM_MS = 280; // must match the ripple-dot-pulse animation-duration in CSS
  var UNIFORM_ANIM_MS = 320; // must match the ripple-uniform-fade animation-duration in CSS

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // "Nearest visible dot-grid element on the page": any element carrying the
  // shared .dot-grid pattern (see style.css) or the homepage's
  // .cta-banner--dots variant, that's currently at least partially on
  // screen. Nearest = smallest distance from the origin to the element's
  // visible center.
  function findNearestVisibleDotGrid(originX, originY) {
    var candidates = Array.prototype.slice.call(
      document.querySelectorAll('.dot-grid, .cta-banner--dots')
    );
    var best = null;
    var bestDist = Infinity;
    candidates.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      var isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
      if (!isVisible) return;
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;
      var dist = Math.hypot(centerX - originX, centerY - originY);
      if (dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    });
    return best;
  }

  function getOverlay(container) {
    var overlay = container.querySelector(':scope > .ripple-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'ripple-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      container.appendChild(overlay);
    }
    return overlay;
  }

  // originX/originY are viewport coordinates (e.g. from a click event or a
  // getBoundingClientRect() center). containerEl is optional — when omitted,
  // the nearest currently-visible dot-grid element is used, and the ripple
  // is skipped entirely if none is in view.
  function triggerRipple(originX, originY, containerEl) {
    var container = containerEl || findNearestVisibleDotGrid(originX, originY);
    if (!container) return; // nothing in view — do nothing, by design

    var rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    var localX = originX - rect.left;
    var localY = originY - rect.top;

    var overlay = getOverlay(container);
    overlay.innerHTML = ''; // clear any leftover dots from a previous ripple
    overlay.classList.remove('ripple-overlay--uniform');

    var cols = Math.ceil(rect.width / GRID_SIZE);
    var rows = Math.ceil(rect.height / GRID_SIZE);
    var fragment = document.createDocumentFragment();
    var maxDelay = 0;

    for (var row = 0; row <= rows; row++) {
      for (var col = 0; col <= cols; col++) {
        var dx = col * GRID_SIZE + DOT_OFFSET;
        var dy = row * GRID_SIZE + DOT_OFFSET;
        if (dx > rect.width + DOT_OFFSET || dy > rect.height + DOT_OFFSET) continue;

        var delay = Math.min(Math.hypot(dx - localX, dy - localY) * MS_PER_PX, MAX_DELAY_MS);
        maxDelay = Math.max(maxDelay, delay);

        var dot = document.createElement('span');
        dot.className = 'ripple-dot';
        dot.style.left = dx + 'px';
        dot.style.top = dy + 'px';
        dot.style.setProperty('--ripple-delay', delay + 'ms');
        fragment.appendChild(dot);
      }
    }
    overlay.appendChild(fragment);

    var reduced = reducedMotion();
    var cleanupDelay;
    if (reduced) {
      // Respect prefers-reduced-motion: every dot fades in and out together,
      // no directional wave and no per-dot movement/scale stagger.
      overlay.classList.add('ripple-overlay--uniform');
      cleanupDelay = UNIFORM_ANIM_MS + 60;
    } else {
      cleanupDelay = maxDelay + DOT_ANIM_MS + 60;
    }

    window.setTimeout(function () {
      overlay.innerHTML = '';
    }, cleanupDelay);
  }

  window.triggerRipple = triggerRipple;
})(window, document);
