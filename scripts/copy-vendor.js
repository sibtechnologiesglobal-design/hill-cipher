'use strict';

/**
 * Copies frontend animation libraries from node_modules into public/vendor
 * so they deploy as plain static files (Vercel's file tracer only bundles
 * modules that are require()d server-side, which these never are).
 * Runs automatically via the postinstall script.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'public', 'vendor');

const COPIES = [
  ['gsap/dist/gsap.min.js', 'gsap/gsap.min.js'],
  ['gsap/dist/ScrollTrigger.min.js', 'gsap/ScrollTrigger.min.js'],
  ['lenis/dist/lenis.min.js', 'lenis/lenis.min.js'],
  ['canvas-confetti/dist/confetti.browser.js', 'canvas-confetti/confetti.browser.js'],
  ['aos/dist/aos.js', 'aos/aos.js'],
  ['aos/dist/aos.css', 'aos/aos.css'],
  ['typed.js/dist/typed.umd.js', 'typed.js/typed.umd.js'],
  ['split-type/umd/index.min.js', 'split-type/index.min.js'],
];

for (const [src, dest] of COPIES) {
  const from = path.join(ROOT, 'node_modules', src);
  const to = path.join(VENDOR, dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

console.log(`copy-vendor: ${COPIES.length} files -> public/vendor/`);
