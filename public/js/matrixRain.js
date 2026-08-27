'use strict';

/**
 * Hand-rolled Matrix-rain canvas background.
 *
 * Exposes window.MatrixRain with:
 *   surge(keyMatrix)  — speed up and rain the *actual* key matrix values
 *                       (in hex) during an active encryption
 *   calm()            — return to the ambient idle state
 */

(() => {
  const canvas = document.getElementById('matrix-rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ';
  const LATIN = '01<>[]{}=+*#$%';
  const IDLE_CHARSET = (KATAKANA + LATIN).split('');

  let charset = IDLE_CHARSET;
  let speedMultiplier = 1;
  let intensity = 0.7; // trail fade strength; higher = shorter trails

  const FONT_SIZE = 16;
  let columns = 0;
  let drops = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.ceil(canvas.width / FONT_SIZE);
    drops = Array.from({ length: columns }, () => ({
      y: Math.random() * -50,
      speed: 0.5 + Math.random() * 0.8,
    }));
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let last = 0;
  const FRAME_MS = 1000 / 30; // 30fps is plenty for rain and easy on GPUs

  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < FRAME_MS) return;
    last = now;

    ctx.fillStyle = `rgba(4, 8, 6, ${0.08 * intensity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${FONT_SIZE}px monospace`;

    for (let i = 0; i < columns; i++) {
      const drop = drops[i];
      const char = charset[(Math.random() * charset.length) | 0];
      const x = i * FONT_SIZE;
      const y = drop.y * FONT_SIZE;

      // Head glyph brighter than the trail
      if (Math.random() < 0.09) {
        ctx.fillStyle = 'rgba(190, 255, 210, 0.9)';
      } else {
        ctx.fillStyle = Math.random() < 0.04
          ? 'rgba(178, 102, 255, 0.75)' // occasional electric-purple glyph
          : 'rgba(0, 255, 136, 0.55)';
      }
      ctx.fillText(char, x, y);

      drop.y += drop.speed * speedMultiplier;
      if (y > canvas.height && Math.random() > 0.975) {
        drop.y = Math.random() * -20;
        drop.speed = 0.5 + Math.random() * 0.8;
      }
    }
  }

  window.addEventListener('resize', resize);
  resize();

  if (reduceMotion) {
    // Single static frame of dim glyphs instead of animation.
    ctx.fillStyle = 'rgba(4, 8, 6, 1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.fillStyle = 'rgba(0, 255, 136, 0.12)';
    for (let i = 0; i < columns; i++) {
      for (let j = 0; j < 6; j++) {
        ctx.fillText(
          IDLE_CHARSET[(Math.random() * IDLE_CHARSET.length) | 0],
          i * FONT_SIZE,
          Math.random() * canvas.height
        );
      }
    }
  } else {
    requestAnimationFrame(frame);
  }

  window.MatrixRain = {
    /** During encryption: rain the real key matrix bytes, faster and denser. */
    surge(keyMatrix) {
      speedMultiplier = 2.6;
      intensity = 1.1;
      if (keyMatrix) {
        const hex = keyMatrix
          .flat()
          .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
          .join('');
        charset = (hex + '×=MOD256').split('');
      }
    },
    calm() {
      speedMultiplier = 1;
      intensity = 0.7;
      charset = IDLE_CHARSET;
    },
  };
})();
