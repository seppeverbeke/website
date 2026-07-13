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
  const totalCount = cards.length;

  const FADE_OUT_MS = 220;

  const applyFilter = (filter) => {
    let visible = 0;
    cards.forEach((card) => {
      const isMatch = filter === 'all' || card.dataset.category === filter;
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
        filter === 'all' ? `${totalCount} projecten` : `${visible} van ${totalCount} projecten`;
    }
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
        applyFilter(pill.dataset.filter);
      });
    });
  }

  if (filterCount) filterCount.textContent = `${totalCount} projecten`;
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
// Guided scroll — desktop-only, JS-driven soft correction (signature detail).
// Deliberately NOT a CSS scroll-snap: a hard snap reads as a shove. Instead,
// once the visitor has fully stopped scrolling near a section boundary
// (last ~15-20% of the section), we nudge the page gently into place with a
// slow ease-out. Any renewed scroll input aborts the nudge instantly.
// ==========================================================================
(function initGuidedScroll() {
  const desktopMedia = window.matchMedia('(min-width: 1024px)');
  const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!desktopMedia.matches || reducedMotionMedia.matches) return;

  const EXCLUDE_SELECTOR =
    '.section:has(#portfolio-grid), .section:has(.case-body), .section:has(.blog-list)';
  const STOP_DEBOUNCE_MS = 180;
  const CORRECTION_MS = 520;
  const BOUNDARY_ZONE = 0.18; // last/first 18% of a section's height

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

  let stopTimer = null;
  let correctionFrame = null;
  let correcting = false;
  let lastScrollY = window.scrollY;
  let scrollDirection = null; // 'down' | 'up' | null — the visitor's most recent real scroll input

  const easeSlow = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const cancelCorrection = () => {
    if (correctionFrame) {
      cancelAnimationFrame(correctionFrame);
      correctionFrame = null;
    }
    if (correcting) {
      correcting = false;
      document.documentElement.classList.remove('js-soft-scroll-correcting');
    }
    // Resync so the next real scroll event measures direction from where the
    // page actually ended up, not from before the correction ran.
    lastScrollY = window.scrollY;
  };

  const findCorrectionTarget = () => {
    // Only ever correct further in the direction the visitor was already
    // scrolling — scrolling down should never snap back upward, and vice versa.
    if (!scrollDirection) return null;

    const viewportH = window.innerHeight;
    const scrollY = window.scrollY;
    let target = null;
    let minDist = Infinity;

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const sectionTop = rect.top + scrollY;
      const sectionBottom = sectionTop + rect.height;
      const zone = rect.height * BOUNDARY_ZONE;

      // Just scrolled past this section's top edge: nudge back up to align it.
      // Only valid while the visitor was scrolling up (target is above scrollY).
      if (scrollDirection === 'up') {
        const distFromTop = scrollY - sectionTop;
        if (distFromTop >= 0 && distFromTop <= zone && distFromTop < minDist) {
          minDist = distFromTop;
          target = sectionTop;
        }
      }
      // About to leave this section at the bottom: nudge forward to the next.
      // Only valid while the visitor was scrolling down (target is below scrollY).
      if (scrollDirection === 'down') {
        const distFromBottom = sectionBottom - (scrollY + viewportH);
        if (distFromBottom >= 0 && distFromBottom <= zone && distFromBottom < minDist) {
          minDist = distFromBottom;
          target = sectionBottom;
        }
      }
    });

    return target;
  };

  const runCorrection = (target) => {
    correcting = true;
    document.documentElement.classList.add('js-soft-scroll-correcting');
    const startY = window.scrollY;
    const distance = target - startY;
    const start = performance.now();

    const step = (now) => {
      if (!correcting) return;
      const progress = Math.min((now - start) / CORRECTION_MS, 1);
      window.scrollTo(0, startY + distance * easeSlow(progress));
      if (progress < 1) {
        correctionFrame = requestAnimationFrame(step);
      } else {
        correcting = false;
        document.documentElement.classList.remove('js-soft-scroll-correcting');
        // Resync so the next real scroll event measures direction from where
        // the page actually ended up, not from before the correction ran.
        lastScrollY = window.scrollY;
      }
    };
    correctionFrame = requestAnimationFrame(step);
  };

  const maybeCorrect = () => {
    const target = findCorrectionTarget();
    if (target === null || Math.abs(target - window.scrollY) < 2) return;
    runCorrection(target);
  };

  // Any genuine user scroll input aborts an in-progress correction instantly
  const abortIfCorrecting = () => {
    if (correcting) cancelCorrection();
  };
  window.addEventListener('wheel', abortIfCorrecting, { passive: true });
  window.addEventListener('touchmove', abortIfCorrecting, { passive: true });
  window.addEventListener('keydown', (event) => {
    const navKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    if (navKeys.includes(event.key)) abortIfCorrecting();
  });

  window.addEventListener(
    'scroll',
    () => {
      // Ignore scroll events fired by our own correction — only react to the
      // visitor's own scrolling for the "has it fully stopped?" debounce.
      if (correcting) return;
      const newY = window.scrollY;
      if (newY > lastScrollY) scrollDirection = 'down';
      else if (newY < lastScrollY) scrollDirection = 'up';
      lastScrollY = newY;
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(maybeCorrect, STOP_DEBOUNCE_MS);
    },
    { passive: true }
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
