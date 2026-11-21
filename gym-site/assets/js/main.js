/* ════════════════════════════════════════════════════════════════════
   KHALSA AKHARA GYM COVENTRY — interactions
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Header state ─────────────────────────────────────────────────── */
  const head = document.getElementById('siteHead');
  const onScroll = () => {
    if (head) head.classList.toggle('is-scrolled', window.scrollY > 10);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Mobile menu ──────────────────────────────────────────────────── */
  const burger = document.getElementById('navBurger');
  const mobileMenu = document.getElementById('mobileMenu');

  const closeMobile = () => {
    if (!mobileMenu || !burger) return;
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    document.documentElement.style.overflow = '';
  };

  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const open = !mobileMenu.classList.contains('is-open');
      mobileMenu.classList.toggle('is-open', open);
      mobileMenu.setAttribute('aria-hidden', String(!open));
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.documentElement.style.overflow = open ? 'hidden' : '';
    });

    mobileMenu.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        if (a.hash && a.hash.length > 1 && a.getAttribute('href').startsWith('#')) return; // same-page anchors
        closeMobile();
      })
    );

    // same-page anchor clicks close the menu too
    mobileMenu.querySelectorAll('a[href^="#"]').forEach(a =>
      a.addEventListener('click', closeMobile)
    );

    const fold = mobileMenu.querySelector('.mob-fold');
    if (fold) {
      fold.querySelector('.mob-fold__toggle').addEventListener('click', () => {
        const open = fold.classList.toggle('is-open');
        fold.querySelector('.mob-fold__toggle').setAttribute('aria-expanded', String(open));
      });
    }
  }

  /* ── Desktop dropdown ─────────────────────────────────────────────── */
  document.querySelectorAll('.main-nav__drop').forEach(drop => {
    const btn = drop.querySelector('.main-nav__dropbtn');
    if (!btn) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = drop.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      document.querySelectorAll('.main-nav__drop').forEach(d => {
        if (d !== drop) {
          d.classList.remove('is-open');
          const b = d.querySelector('.main-nav__dropbtn');
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
    });
    drop.addEventListener('mouseenter', () => {
      drop.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    });
    drop.addEventListener('mouseleave', () => {
      drop.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.main-nav__drop.is-open').forEach(d => {
      d.classList.remove('is-open');
      const b = d.querySelector('.main-nav__dropbtn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  });

  /* ── Reveal on scroll ─────────────────────────────────────────────── */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ── Stat counters ────────────────────────────────────────────────── */
  const counters = document.querySelectorAll('[data-count]');
  const runCounter = el => {
    const target = parseFloat(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const decimals = target % 1 !== 0 ? 1 : 0;
    const dur = 1400;
    const start = performance.now();
    const tick = now => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window && counters.length) {
    const cio = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runCounter(entry.target);
          cio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(c => cio.observe(c));
  } else {
    counters.forEach(c => { c.textContent = (c.dataset.prefix || '') + c.dataset.count + (c.dataset.suffix || ''); });
  }

  /* ── Footer year ──────────────────────────────────────────────────── */
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
})();
