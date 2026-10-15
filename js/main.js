/* ════════════════════════════════════════════════════════════════════
   KHALSA AKHARA WRESTLING COVENTRY — main.js
   Hero slider • parallax • audio • reveals • counters • forms • nav
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ────────────────────────── HERO SLIDER ────────────────────────── */
  var slides   = document.querySelectorAll('.hero-slide');
  var dots     = document.querySelectorAll('.hero-dot');
  var counter  = document.getElementById('heroCounter');
  var prevBtn  = document.getElementById('heroPrev');
  var nextBtn  = document.getElementById('heroNext');
  var SLIDE_MS = 6500;
  var current  = 0;
  var timer    = null;

  if (slides.length) {
    function pad(n) { return String(n + 1).padStart(2, '0'); }

    function goTo(i) {
      if (i === current || !slides[i]) return;
      slides[current].classList.remove('is-active');
      dots[current].classList.remove('is-active');
      /* restart the ken-burns animation */
      var img = slides[i].querySelector('.hero-slide__img');
      if (img) { img.style.animation = 'none'; void img.offsetWidth; img.style.animation = ''; }
      current = i;
      slides[current].classList.add('is-active');
      dots[current].classList.add('is-active');
      if (counter) {
        counter.innerHTML = pad(current) + ' <span>/</span> ' + pad(slides.length - 1);
      }
      restart();
    }

    function next() { goTo((current + 1) % slides.length); }
    function prev() { goTo((current - 1 + slides.length) % slides.length); }
    function restart() {
      clearInterval(timer);
      if (!prefersReduced) timer = setInterval(next, SLIDE_MS);
    }

    if (nextBtn) nextBtn.addEventListener('click', next);
    if (prevBtn) prevBtn.addEventListener('click', prev);

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () { goTo(parseInt(dot.dataset.slide, 10)); });
    });

    /* Swipe support */
    var touchX = 0;
    var hero = document.getElementById('home');
    if (hero) {
      hero.addEventListener('touchstart', function (e) {
        touchX = e.changedTouches[0].clientX;
      }, { passive: true });
      hero.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 55) { dx < 0 ? next() : prev(); }
      }, { passive: true });
    }

    /* Keyboard */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    });

    restart();
  }

  /* ────────────────────────── HEADER STATE ────────────────────────── */
  var head = document.getElementById('siteHead');
  function onScrollHeader() {
    if (!head) return;
    head.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  /* ────────────────────────── MOBILE MENU ─────────────────────────── */
  var burger = document.getElementById('navBurger');
  var menu   = document.getElementById('mobileMenu');
  function closeMenu() {
    if (!menu) return;
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    if (burger) { burger.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }
    document.body.style.overflow = '';
  }
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      menu.setAttribute('aria-hidden', String(!open));
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
    /* Collapsible About Us group in the mobile menu */
    menu.querySelectorAll('.mob-fold__toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fold = btn.closest('.mob-fold');
        var open = fold.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(open));
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ────────────────────────── ABOUT DROPDOWN ──────────────────────── */
  /* Desktop nav "About Us" — opens on hover (CSS) and on click/tap,
     closes on outside click, link click or Escape. */
  var dropBtn  = document.getElementById('aboutDropBtn');
  var dropWrap = dropBtn ? dropBtn.closest('.main-nav__drop') : null;
  function closeDrop() {
    if (!dropWrap) return;
    dropWrap.classList.remove('is-open');
    dropBtn.setAttribute('aria-expanded', 'false');
  }
  if (dropBtn && dropWrap) {
    dropBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = dropWrap.classList.toggle('is-open');
      dropBtn.setAttribute('aria-expanded', String(open));
    });
    dropWrap.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeDrop);
    });
    document.addEventListener('click', function (e) {
      if (!dropWrap.contains(e.target)) closeDrop();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrop();
    });
  }

  /* ────────────────────────── ACTIVE NAV LINK ─────────────────────── */
  var sections = document.querySelectorAll('main section[id]');
  var navLinks = document.querySelectorAll('.main-nav__link');
  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (l) {
          l.classList.toggle('is-active', l.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-42% 0px -52% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ────────────────────────── PARALLAX ────────────────────────────── */
  var parallaxEls = [].slice.call(document.querySelectorAll('[data-parallax]'));
  var ticking = false;

  function runParallax() {
    ticking = false;
    if (prefersReduced) return;
    var vh = window.innerHeight;
    parallaxEls.forEach(function (el) {
      var speed = parseFloat(el.dataset.parallax) || 0.1;
      var r = el.getBoundingClientRect();
      /* how far the element's centre is from the viewport centre */
      var offset = (r.top + r.height / 2) - vh / 2;
      el.style.transform = 'translate3d(0,' + (-offset * speed).toFixed(1) + 'px,0)';
    });
  }
  if (parallaxEls.length) {
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(runParallax); }
    }, { passive: true });
    window.addEventListener('resize', runParallax);
    runParallax();
  }

  /* ────────────────────────── REVEAL ON SCROLL ────────────────────── */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    revealEls.forEach(function (el, i) {
      el.style.setProperty('--d', ((i % 4) * 0.08) + 's');
    });
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { revObs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in-view'); });
  }

  /* ────────────────────────── STAT COUNTERS ───────────────────────── */
  var statsEl = document.getElementById('stats');
  if (statsEl) {
    var counted = false;
    var statObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || counted) return;
        counted = true;
        statsEl.querySelectorAll('[data-count]').forEach(function (num) {
          var target = parseInt(num.dataset.count, 10);
          var prefix = num.dataset.prefix || '';
          var suffix = num.dataset.suffix || '';
          var t0 = null;
          var DUR = 1400;
          function tick(ts) {
            if (!t0) t0 = ts;
            var p = Math.min((ts - t0) / DUR, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            num.textContent = prefix + Math.round(target * eased) + suffix;
            if (p < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
        statObs.unobserve(entry.target);
      });
    }, { threshold: 0.35 });
    statObs.observe(statsEl);
  }

  /* ══════════════════════════════════════════════════════════════════
     AUDIO — "The Singh Anthem"
     Browsers block autoplay-with-sound until the user interacts once,
     so we try on load, then retry at the earliest possible gesture.
     ══════════════════════════════════════════════════════════════════ */
  var audio       = document.getElementById('anthem');
  var soundToggle = document.getElementById('soundToggle');

  function setPlaying(playing) {
    if (soundToggle) soundToggle.classList.toggle('is-playing', playing);
  }

  function tryPlay() {
    if (!audio) return;
    audio.play().then(function () {
      setPlaying(true);
    }).catch(function () {
      setPlaying(false);
    });
  }

  if (audio) {
    audio.volume = 0.9;

    /* Attempt autoplay immediately */
    tryPlay();

    /* Browsers block sound until one user gesture, so we watch for the
       earliest possible interaction and start the anthem the moment it
       becomes allowed — click, tap, keypress, even a mouse move. */
    var armed = false;
    var FALLBACK_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'wheel'];
    function armFallback() {
      if (armed || audio.paused === false) return;
      armed = true;
      tryPlay();
      FALLBACK_EVENTS.forEach(function (ev) {
        document.removeEventListener(ev, armFallback);
      });
    }
    FALLBACK_EVENTS.forEach(function (ev) {
      var opts = (ev === 'touchstart' || ev === 'wheel') ? { passive: true } : false;
      document.addEventListener(ev, armFallback, opts);
    });

    /* Retry whenever the tab regains focus (user may have interacted elsewhere) */
    window.addEventListener('focus', function () { if (audio.paused) tryPlay(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && audio.paused) tryPlay();
    });

    if (soundToggle) soundToggle.addEventListener('click', function () {
      if (audio.paused) { tryPlay(); } else { audio.pause(); setPlaying(false); }
    });
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () { setPlaying(false); });
  }

  /* ══════════════════════════════════════════════════════════════════
     FORMS — real submissions to the local backend (node server.js)
     ══════════════════════════════════════════════════════════════════ */
  function wireForm(formId, url, errorId, successId, mapFn, onDone) {
    var form    = document.getElementById(formId);
    var success = document.getElementById(successId);
    var errorEl = document.getElementById(errorId);
    if (!form || !success) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (errorEl) errorEl.hidden = true;
      form.querySelectorAll('.is-invalid').forEach(function (f) { f.classList.remove('is-invalid'); });

      if (!form.checkValidity()) { form.reportValidity(); return; }

      var data = Object.fromEntries(new FormData(form).entries());
      if (mapFn) data = mapFn(data);

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        var res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        var json = await res.json().catch(function () { return {}; });

        if (res.ok && json.ok) {
          success.hidden = false;
          success.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
          form.reset();
          if (onDone) onDone();
          setTimeout(function () { success.hidden = true; }, 12000);
        } else {
          var errs = json.errors || {};
          var fields = Object.keys(errs);
          if (fields.length) {
            fields.forEach(function (k) {
              var el = form.querySelector('[name="' + k + '"]');
              if (el && el.closest('.field')) {
                el.closest('.field').classList.add('is-invalid');
              }
            });
            if (errorEl) {
              errorEl.innerHTML = fields.map(function (k) { return esc(errs[k]); }).join('<br>');
              errorEl.hidden = false;
            }
          } else if (errorEl) {
            errorEl.textContent = json.error || 'Something went wrong — please try again.';
            errorEl.hidden = false;
          }
        }
      } catch (err) {
        if (errorEl) {
          errorEl.innerHTML = location.protocol === 'file:'
            ? 'This page is open straight from the folder, so it can&rsquo;t reach the club server. Open <a href="http://127.0.0.1:8000/" style="color:var(--orange-hot);">http://127.0.0.1:8000</a> in your browser and try there.'
            : 'Could not reach the server. Make sure it is running (node server.js) and try again.';
          errorEl.hidden = false;
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Contact form → messages inbox in the dashboard */
  wireForm('contactForm', '/api/message', 'contactError', 'contactSuccess', function (d) {
    d.body = d.message || '';
    delete d.message;
    return d;
  });

  /* ────────────────────────── MEDIA — LITE EMBED ──────────────────── */
  /* Thumbnail cards that swap in a YouTube iframe on first click, so the
     page stays fast and nothing loads from YouTube until asked. */
  document.querySelectorAll('.video-card__thumb').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.dataset.video;
      var card = btn.closest('.video-card');
      var thumb = btn;
      if (!id || !card) return;
      var frame = document.createElement('div');
      frame.className = 'video-card__frame';
      frame.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
        '?autoplay=1&rel=0" title="Khalsa Akhara Wrestling video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>';
      card.replaceChild(frame, thumb);
    });
  });
})();
