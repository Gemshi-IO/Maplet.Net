/* ==========================================================================
   Maplet analytics helpers (gtag). Safe no-op if the Google tag is blocked.
   ========================================================================== */

(function () {
  'use strict';

  function track(eventName, params) {
    if (typeof gtag !== 'function') return;
    gtag('event', eventName, params || {});
  }

  window.mapletTrack = track;

  function closestPlacement(el) {
    const withPlacement = el.closest('[data-analytics-placement]');
    if (withPlacement) return withPlacement.getAttribute('data-analytics-placement');
    if (el.closest('.site-header')) return 'header';
    if (el.closest('.hero')) return 'hero';
    if (el.closest('.cta-band')) return 'cta_band';
    if (el.closest('.site-footer')) return 'footer';
    return 'unknown';
  }

  function initAppStoreClicks() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href*="apps.apple.com"]');
      if (!link) return;
      track('app_store_click', { placement: closestPlacement(link) });
    });
  }

  function initTryDemoClick() {
    const demo = document.querySelector('#share-showcase a.btn-primary[href*="share/"]');
    if (!demo) return;
    demo.addEventListener('click', () => {
      track('try_demo_click', { source_section: 'share_showcase' });
    });
  }

  function initFaqToggles() {
    document.querySelectorAll('dl.faq dt').forEach((dt) => {
      dt.style.cursor = 'pointer';
      dt.addEventListener('click', () => {
        track('faq_item_toggle', {
          question_title: (dt.textContent || '').trim().slice(0, 120),
        });
      });
    });
  }

  function initContactEmailClicks(sourcePage) {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="mailto:gemshi@me.com"]');
      if (!link) return;
      track('contact_email_click', { source_page: sourcePage });
    });
  }

  function initSupportGuideViews() {
    const sections = document.querySelectorAll('article.prose h2[id]');
    if (!sections.length || !('IntersectionObserver' in window)) return;

    const seen = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          if (!id || seen.has(id)) return;
          seen.add(id);
          track('support_guide_view', { section_id: id });
        });
      },
      { threshold: 0.45, rootMargin: '0px 0px -20% 0px' }
    );

    sections.forEach((section) => observer.observe(section));

    // Initial hash (e.g. support.html#multi-route)
    const hash = (location.hash || '').replace(/^#/, '');
    if (hash && !seen.has(hash) && document.getElementById(hash)) {
      seen.add(hash);
      track('support_guide_view', { section_id: hash });
    }
  }

  function initIndex() {
    initAppStoreClicks();
    initTryDemoClick();
    initFaqToggles();
    initContactEmailClicks('index');
  }

  function initSupport() {
    initAppStoreClicks();
    initFaqToggles();
    initContactEmailClicks('support');
    initSupportGuideViews();
  }

  function boot() {
    const page = document.body && document.body.dataset.analytics;
    if (page === 'index') initIndex();
    else if (page === 'support') initSupport();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
