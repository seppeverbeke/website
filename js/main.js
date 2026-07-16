// Mobile nav toggle
const navToggle = document.getElementById('nav-toggle');
const siteNav = document.getElementById('site-nav');
if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      siteNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// FAQ accordion
document.querySelectorAll('.faq-item').forEach((item) => {
  const question = item.querySelector('.faq-question');
  question.addEventListener('click', () => {
    const isOpen = item.classList.contains('is-open');
    item.closest('.faq-list').querySelectorAll('.faq-item').forEach((other) => {
      other.classList.remove('is-open');
      other.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('is-open');
      question.setAttribute('aria-expanded', 'true');
    }
  });
});

// Scroll-reveal (signature interaction #2)
const revealTargets = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && revealTargets.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealTargets.forEach((el) => observer.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('is-visible'));
}

// Count-up animation for stat numbers (e.g. over-mij.html)
const statNumbers = document.querySelectorAll('.stat-number');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (statNumbers.length && 'IntersectionObserver' in window && !prefersReducedMotion) {
  const animateCount = (el) => {
    const match = el.textContent.trim().match(/^(\d+)(.*)$/);
    if (!match) return;
    const target = parseInt(match[1], 10);
    const suffix = match[2];
    const duration = 1100;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const statObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          statObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );
  statNumbers.forEach((el) => statObserver.observe(el));
}

// Portfolio filter bar (filter cases by project type)
const portfolioGrid = document.getElementById('portfolio-grid');
if (portfolioGrid) {
  const filterBar = document.querySelector('.filter-bar');
  const filterCount = document.getElementById('filter-count');
  const emptyState = document.getElementById('portfolio-empty');
  const cards = Array.from(portfolioGrid.querySelectorAll('.card'));

  const FADE_OUT_MS = 220;
  let activeFilter = 'all';

  const applyFilters = () => {
    portfolioGrid.classList.toggle('is-filtered', activeFilter !== 'all');
    let visible = 0;
    cards.forEach((card) => {
      const isMatch = activeFilter === 'all' || card.dataset.category === activeFilter;
      if (isMatch) {
        card.classList.remove('is-filtered-out');
        card.classList.remove('is-fading-out');
        card.classList.remove('card-enter');
        void card.offsetWidth; // restart the fade-in animation
        card.classList.add('card-enter');
        visible += 1;
      } else if (!card.classList.contains('is-filtered-out')) {
        // Fade out subtly first, only remove from layout flow once the transition finishes
        card.classList.add('is-fading-out');
        window.setTimeout(() => {
          if (card.classList.contains('is-fading-out')) {
            card.classList.add('is-filtered-out');
          }
        }, FADE_OUT_MS);
      }
    });
    if (filterCount) {
      filterCount.textContent =
        activeFilter === 'all' ? `${cards.length} projecten` : `${visible} van ${cards.length} projecten`;
    }
    if (emptyState) emptyState.hidden = visible !== 0;
  };

  // Initial paint: set visibility directly, no fade animation on load
  const setInitialVisibility = () => {
    let visible = 0;
    cards.forEach((card) => {
      const isMatch = activeFilter === 'all' || card.dataset.category === activeFilter;
      if (isMatch) {
        visible += 1;
      } else {
        card.classList.add('is-filtered-out');
      }
    });
    if (filterCount) filterCount.textContent = `${cards.length} projecten`;
    if (emptyState) emptyState.hidden = visible !== 0;
  };

  if (filterBar) {
    const pills = Array.from(filterBar.querySelectorAll('.filter-pill'));
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        if (pill.classList.contains('is-active')) return;
        pills.forEach((p) => {
          p.classList.remove('is-active');
          p.setAttribute('aria-pressed', 'false');
        });
        pill.classList.add('is-active');
        pill.setAttribute('aria-pressed', 'true');
        activeFilter = pill.dataset.filter;
        applyFilters();
      });
    });
  }

  setInitialVisibility();
}

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Live email validation (teaching micro-interaction): lights up green with a
// checkmark as soon as a valid address is typed, before the form is submitted
const emailField = document.getElementById('email-field');
const emailInput = document.getElementById('email');
if (emailField && emailInput) {
  const validateEmail = () => {
    const isValid = emailInput.value.trim() !== '' && emailInput.validity.valid;
    emailField.classList.toggle('form-field--valid', isValid);
  };
  emailInput.addEventListener('input', validateEmail);
  emailInput.addEventListener('blur', validateEmail);
  validateEmail();
}

// Contact form: submit via AJAX so we can show an inline success message
// instead of redirecting to Netlify's default thank-you page
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  const contactSuccess = document.getElementById('contact-success');
  const contactError = document.getElementById('contact-form-error');

  const encodeFormData = (data) =>
    Object.keys(data)
      .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
      .join('&');

  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    contactError.style.display = 'none';

    const formData = Object.fromEntries(new FormData(contactForm));
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeFormData(formData),
    })
      .then(() => {
        contactForm.style.display = 'none';
        contactSuccess.style.display = 'block';
        requestAnimationFrame(() => contactSuccess.classList.add('is-visible'));
        contactSuccess.setAttribute('tabindex', '-1');
        contactSuccess.focus();
      })
      .catch(() => {
        contactError.style.display = 'block';
      });
  });
}

// ==========================================================================
// Guided scroll — desktop-only, JS-driven speed shaping (signature detail).
// Deliberately NOT a scroll-snap and NOT a post-stop nudge: the page must
// never move on its own after the visitor lets go. Instead, while the
// visitor is actively scrolling (wheel/trackpad), crossing a section
// boundary feels slightly "heavier" — each wheel tick is scaled down as it
// nears the edge — so transitions read as guided rather than abrupt. The
// moment input stops, motion stops; nothing here ever schedules a scroll.
// ==========================================================================
(function initGuidedScroll() {
  const desktopMedia = window.matchMedia('(min-width: 1024px)');
  const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!desktopMedia.matches || reducedMotionMedia.matches) return;

  const EXCLUDE_SELECTOR =
    '.section:has(#portfolio-grid), .section:has(.case-body), .section:has(.blog-list)';
  const BOUNDARY_ZONE = 0.18; // last/first 18% of a section's height
  const MIN_SPEED_FACTOR = 0.35; // slowest speed right at the boundary line
  const RESTORE_MS = 140; // idle gap before we hand scroll-behavior back to CSS

  let sections;
  try {
    sections = Array.from(document.querySelectorAll('.hero, .section')).filter(
      (el) => !el.matches(EXCLUDE_SELECTOR)
    );
  } catch (err) {
    // :has() unsupported in this browser — skip the enhancement entirely
    return;
  }
  if (sections.length < 2) return;

  let restoreTimer = null;

  // Wheel deltas aren't always in pixels — convert line/page units so the
  // manual scrollBy below tracks native scroll speed closely.
  const deltaToPixels = (event) => {
    if (event.deltaMode === 1) return event.deltaY * 16; // DOM_DELTA_LINE
    if (event.deltaMode === 2) return event.deltaY * window.innerHeight; // DOM_DELTA_PAGE
    return event.deltaY; // DOM_DELTA_PIXEL
  };

  // 1 = full native speed. Drops toward MIN_SPEED_FACTOR only while inside
  // the boundary zone AND only in the direction the visitor is heading —
  // scrolling down never gets slowed by a boundary above, and vice versa.
  const speedFactorFor = (direction) => {
    const viewportH = window.innerHeight;
    const scrollY = window.scrollY;
    let factor = 1;

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const sectionTop = rect.top + scrollY;
      const sectionBottom = sectionTop + rect.height;
      const zone = rect.height * BOUNDARY_ZONE;

      if (direction === 'down') {
        const distFromBottom = sectionBottom - (scrollY + viewportH);
        if (distFromBottom >= 0 && distFromBottom <= zone) {
          const progress = 1 - distFromBottom / zone;
          factor = Math.min(factor, 1 - progress * (1 - MIN_SPEED_FACTOR));
        }
      } else if (direction === 'up') {
        const distFromTop = scrollY - sectionTop;
        if (distFromTop >= 0 && distFromTop <= zone) {
          const progress = 1 - distFromTop / zone;
          factor = Math.min(factor, 1 - progress * (1 - MIN_SPEED_FACTOR));
        }
      }
    });

    return factor;
  };

  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return; // pinch-zoom gesture — leave untouched
      const direction = event.deltaY > 0 ? 'down' : event.deltaY < 0 ? 'up' : null;
      if (!direction) return;

      const factor = speedFactorFor(direction);
      if (factor >= 1) return; // outside any boundary zone — full native speed

      // Scale down *this* tick only. No animation, no timer-driven motion —
      // the page moves exactly as much as this single input event asks for.
      event.preventDefault();
      document.documentElement.classList.add('js-soft-scroll-correcting');
      window.scrollBy(0, deltaToPixels(event) * factor);

      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        document.documentElement.classList.remove('js-soft-scroll-correcting');
      }, RESTORE_MS);
    },
    { passive: false }
  );
})();

// ==========================================================================
// Guided scroll-indicator (signature detail #5) — a vertical column of
// section dots, desktop-only. Active dot fills in, hover reveals the
// section name, click smooth-scrolls there.
// ==========================================================================
(function initScrollIndicator() {
  if (!window.matchMedia('(min-width: 1024px)').matches) return;

  const sections = Array.from(document.querySelectorAll('main .hero, main .section'));
  if (sections.length < 2) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nav = document.createElement('nav');
  nav.className = 'scroll-indicator';
  nav.setAttribute('aria-label', 'Sectienavigatie');

  const dots = sections.map((section, index) => {
    if (!section.id) section.id = `scroll-section-${index}`;

    const heading = section.querySelector('h1, h2');
    const eyebrow = section.querySelector('.eyebrow');
    const label = (heading || eyebrow) ? (heading || eyebrow).textContent.trim() : `Sectie ${index + 1}`;

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'scroll-indicator-dot';
    dot.setAttribute('aria-label', label);

    const labelEl = document.createElement('span');
    labelEl.className = 'scroll-indicator-label';
    labelEl.textContent = label;
    dot.appendChild(labelEl);

    dot.addEventListener('click', () => {
      section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    });

    nav.appendChild(dot);
    return dot;
  });

  document.body.appendChild(nav);

  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = sections.indexOf(entry.target);
          if (index === -1 || !entry.isIntersecting) return;
          dots.forEach((dot) => dot.classList.remove('is-active'));
          dots[index].classList.add('is-active');
        });
      },
      { threshold: 0.5 }
    );
    sections.forEach((section) => sectionObserver.observe(section));
  }
})();

// Cursor-following glow — desktop-only, one-off detail on the homepage's
// gratis-intake card. Not reused anywhere else on the site.
(function initIntakeGlow() {
  const card = document.querySelector('.intake-panel');
  if (!card) return;

  const media = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!media.matches) return;

  const glow = document.createElement('div');
  glow.className = 'intake-panel-glow';
  glow.setAttribute('aria-hidden', 'true');
  card.prepend(glow);

  const rect = card.getBoundingClientRect();
  glow.style.setProperty('--glow-x', `${rect.width / 2}px`);
  glow.style.setProperty('--glow-y', `${rect.height / 2}px`);

  card.addEventListener('pointermove', (event) => {
    const cardRect = card.getBoundingClientRect();
    glow.style.setProperty('--glow-x', `${event.clientX - cardRect.left}px`);
    glow.style.setProperty('--glow-y', `${event.clientY - cardRect.top}px`);
  });
  card.addEventListener('pointerenter', () => glow.classList.add('is-visible'));
  card.addEventListener('pointerleave', () => glow.classList.remove('is-visible'));
})();
