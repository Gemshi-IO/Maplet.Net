/* ==========================================================================
   Maplet Landing Page — script.js
   Small progressive-enhancement touches: mobile nav, header scroll state,
   scroll-reveal animations, dynamic footer year. No frameworks.
   ========================================================================== */

(function () {
  'use strict';

  // -- Footer year -----------------------------------------------------
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // -- Mobile nav toggle -------------------------------------------------
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // -- Header scroll shadow ----------------------------------------------
  const header = document.getElementById('siteHeader');
  if (header) {
    const updateHeaderState = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 4);
    };
    updateHeaderState();
    window.addEventListener('scroll', updateHeaderState, { passive: true });
  }

  // -- Capability checks ---------------------------------------------------
  const mq = (q) => window.matchMedia(q);
  const reducedMotion = mq('(prefers-reduced-motion: reduce)');
  const finePointer = mq('(hover: hover) and (pointer: fine)');
  const storyDesktop = mq('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
  const hasScrollTimeline =
    window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');

  // -- Scroll-reveal animations --------------------------------------------
  // Route connectors draw from scroll position when the browser supports
  // scroll timelines; otherwise they draw once on entering the viewport.
  const revealEls = document.querySelectorAll(
    hasScrollTimeline ? '[data-reveal]' : '[data-reveal], [data-route]'
  );
  if ('IntersectionObserver' in window && revealEls.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // -- Hero: pointer-driven 3D tilt (desktop mouse only) ---------------------
  // Pointer events only update target values; a single rAF loop eases toward
  // them and writes two CSS custom properties consumed by `transform`.
  const hero = document.getElementById('hero');
  const rig = document.getElementById('heroRig');

  if (hero && rig) {
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    let rect = null;
    let frame = 0;
    let enabled = false;

    const tick = () => {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      rig.style.setProperty('--px', curX.toFixed(4));
      rig.style.setProperty('--py', curY.toFixed(4));
      if (Math.abs(targetX - curX) > 0.0005 || Math.abs(targetY - curY) > 0.0005) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        if (targetX === 0 && targetY === 0) rig.classList.remove('is-tilting');
      }
    };

    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onEnter = () => {
      rect = hero.getBoundingClientRect();
      rig.classList.add('is-tilting');
    };

    const onMove = (e) => {
      if (!rect) onEnter();
      targetX = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2));
      targetY = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2));
      kick();
    };

    const onLeave = () => {
      rect = null;
      targetX = 0;
      targetY = 0;
      kick();
    };

    const sync = () => {
      const want = finePointer.matches && !reducedMotion.matches;
      if (want === enabled) return;
      enabled = want;
      if (want) {
        hero.addEventListener('pointerenter', onEnter);
        hero.addEventListener('pointermove', onMove, { passive: true });
        hero.addEventListener('pointerleave', onLeave);
      } else {
        hero.removeEventListener('pointerenter', onEnter);
        hero.removeEventListener('pointermove', onMove);
        hero.removeEventListener('pointerleave', onLeave);
        onLeave();
      }
    };

    // The cached rect goes stale on scroll/resize; re-measure on next move.
    window.addEventListener('scroll', () => { rect = null; }, { passive: true });
    window.addEventListener('resize', () => { rect = null; });
    finePointer.addEventListener('change', sync);
    reducedMotion.addEventListener('change', sync);
    sync();
  }

  // -- Story: sticky phone that follows the step being read (desktop) --------
  const story = document.getElementById('story');
  if (story && 'IntersectionObserver' in window) {
    const steps = Array.from(story.querySelectorAll('.story-step'));
    const shots = Array.from(story.querySelectorAll('.story-shot'));
    const glows = Array.from(story.querySelectorAll('.story-glow'));
    const stops = Array.from(story.querySelectorAll('.story-rail-stop'));
    const railFill = document.getElementById('storyRailFill');
    const last = steps.length - 1;
    let current = -1;
    let inView = false;
    let frame = 0;

    const setCurrent = (index) => {
      if (index === current) return;
      current = index;
      steps.forEach((el, i) => el.classList.toggle('is-current', i === index));
      shots.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.step) === index));
      glows.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.step) === index));
    };

    // Rail progress: 0 at the first step's center, 1 at the last step's.
    // The current step is derived from the same number, so fast scrolls or
    // anchor jumps can never leave the phone on a stale screen.
    const updateRail = () => {
      frame = 0;
      if (!railFill || steps.length < 2) return;
      const mid = window.innerHeight / 2;
      const a = steps[0].getBoundingClientRect();
      const b = steps[last].getBoundingClientRect();
      const start = a.top + a.height / 2;
      const end = b.top + b.height / 2;
      const p = Math.max(0, Math.min(1, (mid - start) / (end - start)));
      railFill.style.transform = `scaleY(${p.toFixed(4)})`;
      stops.forEach((el, i) => el.classList.toggle('is-reached', p * last >= i - 0.02));
      setCurrent(Math.min(last, Math.round(p * last)));
    };

    const onScroll = () => {
      if (inView && !frame) frame = requestAnimationFrame(updateRail);
    };

    const storyObserver = new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) onScroll();
    });

    let active = false;
    const sync = () => {
      const want = storyDesktop.matches;
      if (want === active) return;
      active = want;
      if (want) {
        storyObserver.observe(story);
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        if (current === -1) setCurrent(0);
      } else {
        storyObserver.disconnect();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        inView = false;
      }
    };

    storyDesktop.addEventListener('change', sync);
    sync();
  }

  // -- Compass Target: live bearing needle -----------------------------------
  // Mouse: the needle eases toward the cursor's bearing from the dial center.
  // Touch: the needle sweeps with scroll position (native scrolling, no
  // hijacking). Either way only the needle's `transform` changes per frame;
  // the readout text updates only when the whole-degree value changes.
  const compass = document.getElementById('compass');
  const dial = document.getElementById('compassDial');

  if (compass && dial && 'IntersectionObserver' in window) {
    const needle = dial.querySelector('.compass-needle');
    const degEl = document.getElementById('compassDeg');
    const dirEl = document.getElementById('compassDir');
    const targets = Array.from(dial.querySelectorAll('.ct')).map((el) => ({
      el,
      bearing: Number(el.dataset.bearing),
    }));
    const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const norm = (a) => ((a % 360) + 360) % 360;
    const shortest = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

    let cur = 321;
    let target = 321;
    let shownDeg = 321;
    let frame = 0;
    let inView = false;
    let mode = 'off';

    const render = () => {
      needle.style.setProperty('--a', cur.toFixed(2));
      const deg = Math.round(norm(cur)) % 360;
      if (deg === shownDeg) return;
      shownDeg = deg;
      degEl.textContent = `${deg}°`;
      dirEl.textContent = DIRS[Math.round(deg / 45) % 8];
      targets.forEach((t) => {
        t.el.classList.toggle('is-locked', Math.abs(shortest(deg - t.bearing)) < 13);
      });
    };

    const ease = () => {
      const diff = target - cur;
      cur += diff * 0.1;
      if (Math.abs(diff) < 0.05) cur = target;
      render();
      frame = cur === target ? 0 : requestAnimationFrame(ease);
    };

    // Desktop: aim at the cursor
    const onMove = (e) => {
      const r = dial.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (dx * dx + dy * dy < 400) return; // dead zone at the very center
      const bearing = (Math.atan2(dx, -dy) * 180) / Math.PI;
      target = cur + shortest(bearing - cur); // keep rotation continuous
      if (!frame) frame = requestAnimationFrame(ease);
    };

    // Touch: sweep across the targets as the section scrolls through
    const onScrollFrame = () => {
      frame = 0;
      const r = compass.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
      cur = target = 236 + p * 150; // Moon → Qibla → N → home, roughly
      render();
    };

    const onScroll = () => {
      if (inView && !frame) frame = requestAnimationFrame(onScrollFrame);
    };

    const viewObserver = new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView && mode === 'scroll') onScroll();
    });
    viewObserver.observe(compass);

    const setMode = () => {
      const next = reducedMotion.matches ? 'off' : finePointer.matches ? 'mouse' : 'scroll';
      if (next === mode) return;
      compass.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      mode = next;
      if (mode === 'mouse') {
        compass.addEventListener('pointermove', onMove, { passive: true });
      } else if (mode === 'scroll') {
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
      } else {
        cur = target = 321;
        render();
      }
    };

    finePointer.addEventListener('change', setMode);
    reducedMotion.addEventListener('change', setMode);
    setMode();
  }
})();
