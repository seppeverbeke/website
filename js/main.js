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

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

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
