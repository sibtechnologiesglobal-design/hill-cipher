'use strict';

/**
 * Functional core of the app: uploads, validation, API calls, results.
 * Works standalone with zero animation libraries — animations.js listens
 * to the CustomEvents dispatched here and layers choreography on top.
 *
 * Events on document:
 *   cipher:fileselected  { mode }
 *   cipher:start         { mode, keyMatrix }
 *   cipher:success       { mode, looksLikeNoise }
 *   cipher:error         { mode, message }
 */

(() => {
  const $ = (sel) => document.querySelector(sel);
  // Encrypt uploads stay under Vercel's ~4.5 MB request cap; .enc files are
  // uncompressed and can be much larger (fully supported when running locally).
  const MAX_BYTES = { encrypt: 4 * 1024 * 1024, decrypt: 50 * 1024 * 1024 };
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff', 'image/avif'];

  const state = {
    mode: 'encrypt',
    files: { encrypt: null, decrypt: null },
    encMeta: null, // parsed header of the selected .enc file
    downloadUrls: { encrypt: null, decrypt: null },
    busy: false,
  };

  // ---------------------------------------------------------------------
  // Key matrix derivation (mirror of the server, for display only)
  // ---------------------------------------------------------------------

  async function deriveKeyMatrix(password) {
    try {
      const data = new TextEncoder().encode(password);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      return [
        [digest[0] | 1, digest[1] & 0xfe],
        [digest[2], digest[3] | 1],
      ];
    } catch {
      return null; // non-secure context — display falls back to placeholders
    }
  }

  // ---------------------------------------------------------------------
  // Terminal
  // ---------------------------------------------------------------------

  const terminal = $('#terminal');
  const terminalLines = $('#terminal-lines');

  function clearTerminal() {
    terminalLines.innerHTML = '';
    terminal.hidden = true;
  }

  /** Type a line into the terminal character by character. */
  function typeLine(text, { cls = '', speed = 12 } = {}) {
    terminal.hidden = false;
    const line = document.createElement('div');
    line.className = `terminal-line ${cls}`;
    const prompt = document.createElement('span');
    prompt.className = 'terminal-prompt';
    prompt.textContent = '> ';
    const body = document.createElement('span');
    line.append(prompt, body);
    terminalLines.appendChild(line);
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        body.textContent = text.slice(0, ++i);
        if (i < text.length) setTimeout(tick, speed);
        else resolve(line);
      };
      tick();
    });
  }

  // ---------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------

  const errorBanner = $('#error-banner');
  const errorText = $('#error-text');

  function showError(message) {
    errorText.textContent = message;
    errorBanner.hidden = false;
    document.dispatchEvent(new CustomEvent('cipher:error', { detail: { mode: state.mode, message } }));
  }

  function hideError() {
    errorBanner.hidden = true;
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------

  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (state.busy) return;
      const mode = tab.dataset.mode;
      state.mode = mode;
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });
      for (const m of ['encrypt', 'decrypt']) {
        const panel = $(`#panel-${m}`);
        panel.hidden = m !== mode;
        panel.classList.toggle('active', m === mode);
        $(`#result-${m}`).hidden = true;
      }
      hideError();
      clearTerminal();
    });
  });

  // ---------------------------------------------------------------------
  // .enc client-side parsing (for the noise preview)
  // ---------------------------------------------------------------------

  function parseEncHeader(bytes) {
    if (bytes.length < 14) throw new Error('File too small to be a valid .enc file');
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== 'ENC1') throw new Error('Not a valid .enc file (bad magic bytes)');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(4, true);
    const height = view.getUint32(8, true);
    const formatLength = bytes[12];
    const format = String.fromCharCode(...bytes.subarray(13, 13 + formatLength));
    const ciphertext = bytes.subarray(13 + formatLength);
    return { width, height, format, ciphertext };
  }

  /** Draw ciphertext bytes as an RGB image — the honest face of the data. */
  function drawCiphertext(canvas, { width, height, ciphertext }) {
    const paddedLength = Math.ceil((width * height) / 2) * 2;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      imageData.data[i * 4] = ciphertext[i] ?? 0;
      imageData.data[i * 4 + 1] = ciphertext[paddedLength + i] ?? 0;
      imageData.data[i * 4 + 2] = ciphertext[paddedLength * 2 + i] ?? 0;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // ---------------------------------------------------------------------
  // Dropzones
  // ---------------------------------------------------------------------

  function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function validateFile(file, mode) {
    if (file.size > MAX_BYTES[mode]) {
      return `File exceeds the ${mode === 'encrypt' ? '4' : '50'} MB limit`;
    }
    if (mode === 'encrypt') {
      if (!IMAGE_TYPES.includes(file.type)) return 'Only image files can be encrypted (png, jpeg, webp, gif, tiff, avif)';
    } else if (!file.name.toLowerCase().endsWith('.enc')) {
      return 'Only .enc files can be decrypted';
    }
    return null;
  }

  async function acceptFile(file, mode) {
    hideError();
    const problem = validateFile(file, mode);
    if (problem) {
      showError(problem);
      return;
    }

    const zone = $(`#dropzone-${mode}`);
    const idle = zone.querySelector('.dropzone-idle');
    const preview = zone.querySelector('.dropzone-preview');

    if (mode === 'encrypt') {
      const url = URL.createObjectURL(file);
      const img = $('#preview-encrypt');
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
      $('#meta-encrypt').textContent = `${file.name} — ${humanSize(file.size)}`;
    } else {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const parsed = parseEncHeader(bytes);
        state.encMeta = parsed;
        drawCiphertext($('#preview-decrypt'), parsed);
        $('#meta-decrypt').textContent =
          `${file.name} — ${humanSize(file.size)} — ${parsed.width}×${parsed.height} ${parsed.format}`;
      } catch (err) {
        showError(err.message);
        return;
      }
    }

    state.files[mode] = file;
    idle.hidden = true;
    preview.hidden = false;
    updateRunButtons();
    document.dispatchEvent(new CustomEvent('cipher:fileselected', { detail: { mode } }));
  }

  for (const mode of ['encrypt', 'decrypt']) {
    const zone = $(`#dropzone-${mode}`);
    const input = $(`#file-${mode}`);

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => {
      if (input.files[0]) acceptFile(input.files[0], mode);
    });

    for (const evt of ['dragenter', 'dragover']) {
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      });
    }
    for (const evt of ['dragleave', 'drop']) {
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
      });
    }
    zone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) acceptFile(file, mode);
    });

    $(`#password-${mode}`).addEventListener('input', updateRunButtons);
  }

  function updateRunButtons() {
    for (const mode of ['encrypt', 'decrypt']) {
      const ready = Boolean(state.files[mode]) && $(`#password-${mode}`).value.length > 0 && !state.busy;
      $(`#run-${mode}`).disabled = !ready;
    }
  }

  // ---------------------------------------------------------------------
  // Client-side decryption fallback.
  // Vercel rejects request bodies over ~4.5 MB before the server sees them,
  // but .enc files hold uncompressed pixels and easily exceed that. Decryption
  // is just P = K^-1 * C mod 256 — the browser can do it locally on files of
  // any size, no upload required. Server decryption remains the primary path
  // for normal-sized files (and the curl API).
  // ---------------------------------------------------------------------

  const HOSTED_REQUEST_CAP = 4.3 * 1024 * 1024;
  const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const FORCE_CLIENT_DECRYPT = new URLSearchParams(location.search).has('forceClientDecrypt');

  const mod256 = (n) => ((n % 256) + 256) % 256;

  function modularInverse256(a) {
    a = mod256(a);
    let [oldR, r] = [a, 256];
    let [oldS, s] = [1, 0];
    while (r !== 0) {
      const q = Math.floor(oldR / r);
      [oldR, r] = [r, oldR - q * r];
      [oldS, s] = [s, oldS - q * s];
    }
    return oldR === 1 ? ((oldS % 256) + 256) % 256 : null;
  }

  /** K^-1 = det(K)^-1 * adj(K) mod 256 — mirror of the server implementation. */
  function invertKeyMatrix(k) {
    const det = mod256(k[0][0] * k[1][1] - k[0][1] * k[1][0]);
    const detInv = modularInverse256(det);
    if (detInv === null) throw new Error('Key matrix not invertible (should be impossible)');
    return [
      [mod256(k[1][1] * detInv), mod256(-k[0][1] * detInv)],
      [mod256(-k[1][0] * detInv), mod256(k[0][0] * detInv)],
    ];
  }

  async function clientDecrypt(password) {
    const { width, height, format, ciphertext } = state.encMeta;
    const key = await deriveKeyMatrix(password);
    if (!key) throw new Error('This browser does not support the required crypto APIs');
    const [[a, b], [c, d]] = invertKeyMatrix(key);

    const px = width * height;
    const padded = Math.ceil(px / 2) * 2;
    const out = new Uint8ClampedArray(px * 4);

    for (let ch = 0; ch < 3; ch++) {
      const base = ch * padded;
      for (let i = 0; i < padded; i += 2) {
        const c0 = ciphertext[base + i];
        const c1 = ciphertext[base + i + 1];
        if (i < px) out[i * 4 + ch] = (a * c0 + b * c1) % 256;
        if (i + 1 < px) out[(i + 1) * 4 + ch] = (c * c0 + d * c1) % 256;
      }
    }
    for (let i = 0; i < px; i++) out[i * 4 + 3] = 255;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(out, width, height), 0, 0);
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
    if (!blob) throw new Error('Could not encode the decrypted image');
    return blob;
  }

  // ---------------------------------------------------------------------
  // Noise heuristic — was that password right?
  // The Hill cipher has no integrity check: a wrong key "succeeds" but
  // produces noise. The standard discriminator from the image-encryption
  // literature is adjacent-pixel correlation: any real image (photos,
  // gradients, even harsh patterns) has |r| near 1, cipher noise has r ~ 0.
  // ---------------------------------------------------------------------

  function looksLikeNoise(imgElement) {
    try {
      // Sample at natural scale (cropped to 128px) — scaling would blur the
      // noise via interpolation and reintroduce fake correlation.
      const w = Math.min(imgElement.naturalWidth, 128);
      const h = Math.min(imgElement.naturalHeight, 128);
      if (w < 4 || h < 2) return false;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imgElement, 0, 0);
      const { data } = ctx.getImageData(0, 0, w, h);

      // Pearson correlation between horizontally adjacent pixels (red channel)
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 1; x < w; x++) {
          const i = (y * w + x) * 4;
          const a = data[i - 4];
          const b = data[i];
          n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
        }
      }
      const cov = sxy / n - (sx / n) * (sy / n);
      const vx = sxx / n - (sx / n) ** 2;
      const vy = syy / n - (sy / n) ** 2;
      if (vx < 1 || vy < 1) return false; // flat image: structured, not noise
      const r = cov / Math.sqrt(vx * vy);
      return Math.abs(r) < 0.15;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // The run sequence
  // ---------------------------------------------------------------------

  const STATUS_SCRIPTS = {
    encrypt: [
      'reading pixel data...',
      'hashing password with SHA-256...',
      'deriving 2×2 key matrix K... det(K) forced odd',
      'splitting channels into 2×1 pixel blocks...',
      'computing C = K·P mod 256 for every block...',
      'packing ENC1 container...',
    ],
    decrypt: [
      'parsing ENC1 header...',
      'hashing password with SHA-256...',
      'deriving key matrix K...',
      'computing modular inverse of det(K)...',
      'building K⁻¹ from the adjugate matrix...',
      'computing P = K⁻¹·C mod 256 for every block...',
      'reassembling RGB channels...',
    ],
  };

  async function playStatusScript(mode, minStepMs) {
    for (const line of STATUS_SCRIPTS[mode]) {
      const start = performance.now();
      await typeLine(line);
      const elapsed = performance.now() - start;
      if (elapsed < minStepMs) await new Promise((r) => setTimeout(r, minStepMs - elapsed));
    }
  }

  async function run(mode) {
    if (state.busy) return;
    const file = state.files[mode];
    const password = $(`#password-${mode}`).value;
    if (!file || !password) return;

    state.busy = true;
    hideError();
    clearTerminal();
    $(`#result-${mode}`).hidden = true;
    updateRunButtons();
    const btn = $(`#run-${mode}`);
    btn.disabled = true;
    btn.textContent = 'WORKING…';

    const keyMatrix = await deriveKeyMatrix(password);
    document.dispatchEvent(new CustomEvent('cipher:start', { detail: { mode, keyMatrix } }));

    // Files above the hosted request cap can't reach the server on Vercel —
    // decrypt those right here in the browser instead of a doomed upload.
    const useClient =
      mode === 'decrypt' &&
      state.encMeta &&
      (FORCE_CLIENT_DECRYPT || (!IS_LOCAL && file.size > HOSTED_REQUEST_CAP));

    if (useClient) {
      await typeLine('file exceeds the hosted upload cap — decrypting in-browser, zero upload', {
        cls: 'terminal-ok',
      });
    }

    const request = useClient
      ? clientDecrypt(password)
      : (() => {
          const form = new FormData();
          form.append(mode === 'encrypt' ? 'image' : 'file', file);
          form.append('password', password);
          return fetch(`/api/${mode}`, { method: 'POST', body: form }).then(async (res) => {
            if (!res.ok) {
              let message = `Request failed (${res.status})`;
              try {
                const body = await res.json();
                if (body.error) message = body.error;
              } catch {
                if (res.status === 413) message = 'File too large for the hosted server (~4.5 MB request cap)';
              }
              throw new Error(message);
            }
            return res.blob();
          });
        })();

    // Let the terminal choreography finish even if the work returns first
    // — and never gate the real result on animation more than ~2.5s.
    const script = playStatusScript(mode, 260);

    let blob;
    try {
      [blob] = await Promise.all([request, script]);
    } catch (err) {
      await script.catch(() => {});
      // Server said the upload is too big (Vercel platform cap) but we can
      // still finish the job locally in the browser.
      if (mode === 'decrypt' && state.encMeta && /413|too large/i.test(err.message)) {
        await typeLine('server rejected the upload — retrying in-browser...', { cls: 'terminal-ok' });
        try {
          blob = await clientDecrypt(password);
        } catch (err2) {
          await typeLine(`ERROR: ${err2.message}`, { cls: 'terminal-error' });
          showError(err2.message);
          finishRun(mode);
          return;
        }
      } else {
        await typeLine(`ERROR: ${err.message}`, { cls: 'terminal-error' });
        showError(err.message);
        finishRun(mode);
        return;
      }
    }

    await typeLine(mode === 'encrypt' ? 'done. ciphertext ready.' : 'done. image reconstructed.', {
      cls: 'terminal-ok',
    });

    if (mode === 'encrypt') await showEncryptResult(file, blob);
    else await showDecryptResult(file, blob);
    finishRun(mode);
  }

  function finishRun(mode) {
    state.busy = false;
    const btn = $(`#run-${mode}`);
    btn.textContent = mode === 'encrypt' ? 'ENCRYPT ▸' : 'DECRYPT ▸';
    updateRunButtons();
  }

  // ---------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------

  function setDownload(mode, blob, filename) {
    if (state.downloadUrls[mode]) URL.revokeObjectURL(state.downloadUrls[mode]);
    const url = URL.createObjectURL(blob);
    state.downloadUrls[mode] = url;
    const link = $(`#download-${mode}`);
    link.href = url;
    link.download = filename;
  }

  async function showEncryptResult(sourceFile, blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const parsed = parseEncHeader(bytes);
    drawCiphertext($('#enc-noise-canvas'), parsed);

    const base = sourceFile.name.replace(/\.[^.]+$/, '') || 'image';
    setDownload('encrypt', blob, `${base}.enc`);
    $('#enc-result-meta').textContent =
      `${base}.enc — ${humanSize(blob.size)} — ${parsed.width}×${parsed.height}`;

    $('#result-encrypt').hidden = false;
    document.dispatchEvent(new CustomEvent('cipher:success', { detail: { mode: 'encrypt', looksLikeNoise: false } }));
    refreshHistory();
  }

  async function showDecryptResult(sourceFile, blob) {
    const url = URL.createObjectURL(blob);
    const img = $('#compare-after');

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    // Before side: the ciphertext of the uploaded .enc, drawn client-side.
    if (state.encMeta) {
      const before = $('#compare-before');
      drawCiphertext(before, state.encMeta);
    }

    const noisy = looksLikeNoise(img);
    const base = sourceFile.name.replace(/\.enc$/i, '') || 'decrypted';
    const ext = state.encMeta?.format || 'png';
    setDownload('decrypt', blob, `${base}.${ext}`);

    const note = $('#dec-result-note');
    const title = $('#dec-result-title');
    if (noisy) {
      title.textContent = 'OUTPUT LOOKS LIKE NOISE';
      title.classList.add('warn');
      note.innerHTML =
        'The math ran fine — but this output has no pixel structure. ' +
        'A wrong password builds a different <span class="mono">K</span>, and ' +
        '<span class="mono">K⁻¹</span> of the wrong matrix yields noise. Check the password and retry.';
    } else {
      title.textContent = 'DECRYPTION COMPLETE';
      title.classList.remove('warn');
      note.innerHTML = 'Recovered with <span class="mono accent">P = K⁻¹·C mod 256</span>.';
    }

    $('#result-decrypt').hidden = false;
    initCompareSlider();
    document.dispatchEvent(new CustomEvent('cipher:success', { detail: { mode: 'decrypt', looksLikeNoise: noisy } }));
  }

  $('#run-encrypt').addEventListener('click', () => run('encrypt'));
  $('#run-decrypt').addEventListener('click', () => run('decrypt'));

  for (const mode of ['encrypt', 'decrypt']) {
    $(`#reset-${mode}`).addEventListener('click', () => {
      state.files[mode] = null;
      $(`#file-${mode}`).value = '';
      $(`#password-${mode}`).value = '';
      const zone = $(`#dropzone-${mode}`);
      zone.querySelector('.dropzone-idle').hidden = false;
      zone.querySelector('.dropzone-preview').hidden = true;
      $(`#result-${mode}`).hidden = true;
      hideError();
      clearTerminal();
      updateRunButtons();
    });
  }

  // ---------------------------------------------------------------------
  // Before/after compare slider
  // ---------------------------------------------------------------------

  let compareSliderReady = false;
  let resetComparePos = null;

  function initCompareSlider() {
    if (compareSliderReady) {
      resetComparePos();
      return;
    }
    compareSliderReady = true;

    const compare = $('#compare');
    const clip = $('#compare-after-clip');
    const handle = $('#compare-handle');
    let pos = 0.5;

    function render() {
      clip.style.width = `${pos * 100}%`;
      handle.style.left = `${pos * 100}%`;
    }
    resetComparePos = () => { pos = 0.5; render(); };

    function setFromClientX(clientX) {
      const rect = compare.getBoundingClientRect();
      pos = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      render();
    }

    let dragging = false;
    const down = (e) => {
      dragging = true;
      setFromClientX(e.touches ? e.touches[0].clientX : e.clientX);
      e.preventDefault();
    };
    const move = (e) => {
      if (dragging) setFromClientX(e.touches ? e.touches[0].clientX : e.clientX);
    };
    const up = () => { dragging = false; };

    compare.onpointerdown = down;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    handle.onkeydown = (e) => {
      if (e.key === 'ArrowLeft') { pos = Math.max(0, pos - 0.05); render(); }
      if (e.key === 'ArrowRight') { pos = Math.min(1, pos + 0.05); render(); }
    };
    render();
  }

  // ---------------------------------------------------------------------
  // Recent encryptions (Supabase-backed; section stays hidden when the
  // server has no Supabase configured)
  // ---------------------------------------------------------------------

  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  async function refreshHistory() {
    const section = $('#history');
    if (!section) return;
    try {
      const res = await fetch('/api/history');
      if (!res.ok) throw new Error(`history ${res.status}`);
      const { configured, items } = await res.json();
      if (!configured || !items.length) {
        section.hidden = true;
        return;
      }
      const list = $('#history-list');
      list.innerHTML = '';
      for (const item of items) {
        const li = document.createElement('li');
        li.className = 'history-item';
        const name = document.createElement('span');
        name.className = 'history-name';
        name.textContent = item.original_filename || 'unnamed';
        const size = document.createElement('span');
        size.className = 'history-size';
        size.textContent = humanSize(item.file_size_bytes || 0);
        const when = document.createElement('span');
        when.className = 'history-when';
        when.textContent = timeAgo(item.created_at);
        li.append(name, size, when);
        list.appendChild(li);
      }
      section.hidden = false;
    } catch {
      section.hidden = true; // history is a bonus feature — never break the app for it
    }
  }

  refreshHistory();

  // ---------------------------------------------------------------------
  // Expose for the animation layer
  // ---------------------------------------------------------------------

  window.HillApp = { state, deriveKeyMatrix };
  updateRunButtons();
})();
