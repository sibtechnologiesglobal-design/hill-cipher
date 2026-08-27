'use strict';

/**
 * Animation layer. Everything here is progressive enhancement:
 * every library is feature-checked, and the app in main.js is fully
 * functional if none of this runs.
 */

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hasGsap = typeof gsap !== 'undefined';
  const hasScrollTrigger = hasGsap && typeof ScrollTrigger !== 'undefined';
  if (hasScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  const GLYPHS = '01アイウエオ<>[]{}#$%&*+=';
  const randGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  // -------------------------------------------------------------------
  // Lenis smooth scroll
  // -------------------------------------------------------------------

  let lenis = null;
  if (typeof Lenis !== 'undefined' && !reduceMotion) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    document.documentElement.classList.add('lenis');
    if (hasGsap) {
      lenis.on('scroll', () => hasScrollTrigger && ScrollTrigger.update());
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    // Anchor links go through Lenis so they inherit the easing
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target) {
          e.preventDefault();
          lenis.scrollTo(target, { offset: -60 });
        }
      });
    });
  }

  // -------------------------------------------------------------------
  // AOS reveals
  // -------------------------------------------------------------------

  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 700, easing: 'ease-out-cubic', once: true, offset: 80 });
  }

  // -------------------------------------------------------------------
  // Hero: split-type headline + typed tagline
  // -------------------------------------------------------------------

  if (typeof SplitType !== 'undefined' && hasGsap && !reduceMotion) {
    const split = new SplitType('#hero-title', { types: 'chars' });
    gsap.from(split.chars, {
      opacity: 0,
      y: 40,
      rotateX: -90,
      stagger: 0.025,
      duration: 0.7,
      ease: 'back.out(1.6)',
      delay: 0.15,
    });
  }

  if (typeof Typed !== 'undefined') {
    document.body.classList.add('typed-active');
    new Typed('#typed-tagline', {
      strings: [
        'Every pixel pair multiplied by a 2×2 key matrix, mod 256.',
        'C = K·P mod 256 — the whole cipher in one equation.',
        'Wrong key? Wrong matrix. Pure noise. That&apos;s the math.',
      ],
      typeSpeed: 32,
      backSpeed: 12,
      backDelay: 2600,
      startDelay: 900,
      loop: true,
      smartBackspace: false,
    });
  }

  // Hero entrance for the rest
  if (hasGsap && !reduceMotion) {
    gsap.from(['.hero-kicker', '.hero-matrix', '.hero-actions'], {
      opacity: 0,
      y: 24,
      duration: 0.8,
      stagger: 0.18,
      delay: 0.5,
      ease: 'power3.out',
    });
  }

  // -------------------------------------------------------------------
  // Hero matrix: numbers subtly shift; follows the password live
  // -------------------------------------------------------------------

  const heroCells = $$('#hero-matrix .matrix-cell');
  let heroMatrixLocked = false;

  function setHeroMatrix(values) {
    heroCells.forEach((cell, i) => {
      const target = values[i];
      if (hasGsap && !reduceMotion) {
        const obj = { v: parseInt(cell.textContent, 10) || 0 };
        gsap.to(obj, {
          v: target,
          duration: 0.6,
          ease: 'power2.out',
          onUpdate: () => { cell.textContent = Math.round(obj.v); },
        });
      } else {
        cell.textContent = target;
      }
    });
  }

  if (!reduceMotion) {
    setInterval(() => {
      if (heroMatrixLocked) return;
      setHeroMatrix(heroCells.map(() => (Math.random() * 256) | 0));
    }, 2400);
  }

  // When a password is typed anywhere, the hero matrix becomes *real*
  for (const mode of ['encrypt', 'decrypt']) {
    const input = $(`#password-${mode}`);
    input?.addEventListener('input', async () => {
      if (!input.value) { heroMatrixLocked = false; return; }
      const key = await window.HillApp?.deriveKeyMatrix(input.value);
      if (key) {
        heroMatrixLocked = true;
        setHeroMatrix(key.flat());
      }
    });
  }

  if (hasGsap && !reduceMotion) {
    gsap.to('.matrix-bracket', {
      textShadow: '0 0 20px rgba(0,255,136,0.9), 0 0 60px rgba(0,255,136,0.3)',
      repeat: -1,
      yoyo: true,
      duration: 1.6,
      ease: 'sine.inOut',
    });
  }

  // -------------------------------------------------------------------
  // Magnetic cursor
  // -------------------------------------------------------------------

  const dot = $('.cursor-dot');
  const ring = $('.cursor-ring');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (dot && ring && finePointer && !reduceMotion) {
    document.body.classList.add('custom-cursor-on');
    const pos = { x: innerWidth / 2, y: innerHeight / 2 };
    const ringPos = { x: pos.x, y: pos.y };
    let magnet = null;

    window.addEventListener('mousemove', (e) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
    });

    $$('.magnetic').forEach((el) => {
      el.addEventListener('mouseenter', () => { magnet = el; ring.classList.add('is-hovering'); });
      el.addEventListener('mouseleave', () => {
        magnet = null;
        ring.classList.remove('is-hovering');
        if (hasGsap) gsap.to(el, { x: 0, y: 0, duration: 0.4, ease: 'elastic.out(1, 0.4)' });
      });
    });

    function cursorFrame() {
      // Ring lags behind the dot for the trailing feel
      ringPos.x += (pos.x - ringPos.x) * 0.16;
      ringPos.y += (pos.y - ringPos.y) * 0.16;
      dot.style.transform = `translate(${pos.x - 3}px, ${pos.y - 3}px)`;
      const half = ring.offsetWidth / 2;
      ring.style.transform = `translate(${ringPos.x - half}px, ${ringPos.y - half}px)`;

      // Button subtly leans toward the cursor while hovered
      if (magnet && hasGsap) {
        const r = magnet.getBoundingClientRect();
        const dx = pos.x - (r.left + r.width / 2);
        const dy = pos.y - (r.top + r.height / 2);
        gsap.to(magnet, { x: dx * 0.22, y: dy * 0.22, duration: 0.3, ease: 'power2.out' });
      }
      requestAnimationFrame(cursorFrame);
    }
    requestAnimationFrame(cursorFrame);
  }

  // -------------------------------------------------------------------
  // Scroll choreography
  // -------------------------------------------------------------------

  if (hasScrollTrigger && !reduceMotion) {
    gsap.from('.panel-shell', {
      opacity: 0,
      y: 60,
      scale: 0.97,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: '#app', start: 'top 75%' },
    });
    gsap.to('#hero .hero-content', {
      opacity: 0.15,
      y: -80,
      ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }

  // -------------------------------------------------------------------
  // Text scramble helper (used for result titles)
  // -------------------------------------------------------------------

  function scrambleText(el, finalText, duration = 900) {
    if (reduceMotion) { el.textContent = finalText; return; }
    const start = performance.now();
    (function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const settled = Math.floor(finalText.length * t);
      el.textContent =
        finalText.slice(0, settled) +
        [...finalText.slice(settled)].map((c) => (c === ' ' ? ' ' : randGlyph())).join('');
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = finalText;
    })(start);
  }

  // -------------------------------------------------------------------
  // Cipher stage: the "actual math" in-flight visualization
  // -------------------------------------------------------------------

  const stage = $('#cipher-stage');
  let stageTicker = null;

  function startStage(mode, keyMatrix) {
    if (!stage) return;
    stage.hidden = false;
    $('#stage-out-caption').textContent = mode === 'encrypt' ? 'ciphertext C' : 'plaintext P';

    const keyCells = $$('#stage-key-matrix span');
    const key = keyMatrix ? keyMatrix.flat() : [0, 0, 0, 0];
    keyCells.forEach((c, i) => { c.textContent = key[i]; });

    const blockCells = $$('#stage-pixel-block span');
    const outCells = $$('#stage-out-block span');

    // Step through real block transforms while the request is in flight
    const MOD = 256;
    stageTicker = setInterval(() => {
      const p0 = (Math.random() * 256) | 0;
      const p1 = (Math.random() * 256) | 0;
      blockCells[0].textContent = p0;
      blockCells[1].textContent = p1;
      if (keyMatrix) {
        outCells[0].textContent = (keyMatrix[0][0] * p0 + keyMatrix[0][1] * p1) % MOD;
        outCells[1].textContent = (keyMatrix[1][0] * p0 + keyMatrix[1][1] * p1) % MOD;
      } else {
        outCells[0].textContent = (Math.random() * 256) | 0;
        outCells[1].textContent = (Math.random() * 256) | 0;
      }
    }, reduceMotion ? 100000 : 130);

    if (hasGsap && !reduceMotion) {
      gsap.fromTo(stage, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
      gsap.fromTo('.stage-item', { opacity: 0, x: -12 }, { opacity: 1, x: 0, stagger: 0.1, duration: 0.35 });
    }
  }

  function stopStage() {
    if (stageTicker) clearInterval(stageTicker);
    stageTicker = null;
    if (!stage) return;
    if (hasGsap && !reduceMotion) {
      gsap.to(stage, {
        opacity: 0,
        y: -10,
        duration: 0.35,
        onComplete: () => { stage.hidden = true; gsap.set(stage, { clearProps: 'all' }); },
      });
    } else {
      stage.hidden = true;
    }
  }

  // -------------------------------------------------------------------
  // App event choreography
  // -------------------------------------------------------------------

  document.addEventListener('cipher:fileselected', (e) => {
    const preview = $(`#dropzone-${e.detail.mode} .dropzone-preview`);
    if (hasGsap && preview && !reduceMotion) {
      gsap.from(preview, { opacity: 0, scale: 0.92, duration: 0.5, ease: 'back.out(1.5)' });
    }
  });

  document.addEventListener('cipher:start', (e) => {
    const { mode, keyMatrix } = e.detail;
    startStage(mode, keyMatrix);
    window.MatrixRain?.surge(keyMatrix);
  });

  document.addEventListener('cipher:success', (e) => {
    const { mode, looksLikeNoise } = e.detail;
    stopStage();
    window.MatrixRain?.calm();

    if (mode === 'encrypt') {
      const title = $('#enc-result-title');
      scrambleText(title, 'ENCRYPTION COMPLETE');
      if (hasGsap && !reduceMotion) {
        gsap.from('#result-encrypt .enc-artifact', { opacity: 0, scale: 0.9, filter: 'blur(8px)', duration: 0.7, ease: 'power3.out' });
        gsap.from('#result-encrypt .result-actions > *', { opacity: 0, y: 18, stagger: 0.12, duration: 0.5, delay: 0.3 });
      }
      scrambleText($('#enc-result-meta'), $('#enc-result-meta').textContent, 700);
    } else {
      const title = $('#dec-result-title');
      scrambleText(title, title.textContent);
      const img = $('#compare-after');
      img.classList.remove('resolving');
      // restart the pixelated-to-sharp resolve animation
      void img.offsetWidth;
      if (!reduceMotion) img.classList.add('resolving');

      if (hasGsap && !reduceMotion) {
        gsap.from('#result-decrypt .compare-wrap', { opacity: 0, y: 20, duration: 0.7, ease: 'power3.out' });
        gsap.from('#result-decrypt .result-actions > *', { opacity: 0, y: 18, stagger: 0.12, duration: 0.5, delay: 0.3 });
        gsap.fromTo('#compare-after-clip', { width: '0%' }, { width: '50%', duration: 1.2, delay: 0.4, ease: 'power3.inOut' });
        gsap.fromTo('#compare-handle', { left: '0%' }, { left: '50%', duration: 1.2, delay: 0.4, ease: 'power3.inOut' });
      }

      if (!looksLikeNoise && typeof confetti !== 'undefined' && !reduceMotion) {
        const rect = $('#result-decrypt').getBoundingClientRect();
        const origin = {
          x: (rect.left + rect.width / 2) / innerWidth,
          y: Math.min(0.9, Math.max(0.1, (rect.top + 80) / innerHeight)),
        };
        confetti({ particleCount: 90, spread: 75, origin, colors: ['#00ff88', '#b266ff', '#ffffff'], disableForReducedMotion: true });
        setTimeout(() => confetti({ particleCount: 45, angle: 60, spread: 55, origin: { x: origin.x - 0.2, y: origin.y }, colors: ['#00ff88', '#b266ff'] }), 220);
        setTimeout(() => confetti({ particleCount: 45, angle: 120, spread: 55, origin: { x: origin.x + 0.2, y: origin.y }, colors: ['#00ff88', '#b266ff'] }), 380);
      }
    }
    if (hasScrollTrigger) ScrollTrigger.refresh();
  });

  document.addEventListener('cipher:error', () => {
    stopStage();
    window.MatrixRain?.calm();
    const shell = $('.panel-shell');
    const banner = $('#error-banner');
    if (!reduceMotion) {
      shell?.classList.remove('shake');
      banner?.classList.remove('glitching');
      void shell?.offsetWidth;
      shell?.classList.add('shake');
      banner?.classList.add('glitching');
      setTimeout(() => {
        shell?.classList.remove('shake');
        banner?.classList.remove('glitching');
      }, 600);
    }
  });
})();
