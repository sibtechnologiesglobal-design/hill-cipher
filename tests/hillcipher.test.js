'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
  MODULUS,
  generateKeyMatrix,
  modularInverse,
  determinantMod,
  matrixInverseMod,
  encryptBlock,
  decryptBlock,
  processImage,
  buildEncFile,
  parseEncFile,
} = require('../server/lib/hillcipher');

const { encryptImage, decryptEnc, decodeToChannels } = require('../server/lib/imageProcessor');

// ---------------------------------------------------------------------------
// Key matrix derivation
// ---------------------------------------------------------------------------

test('generateKeyMatrix always yields an odd determinant (invertible mod 256)', () => {
  const passwords = [
    'password', '', 'a', '12345', 'hunter2', 'correct horse battery staple',
    '\u00e9\u00e8\u00ea unicode \u{1f512}', ' ', 'ENC1',
    ...Array.from({ length: 200 }, (_, i) => `fuzz-${i}-${i * 7919}`),
  ];
  for (const pw of passwords) {
    const key = generateKeyMatrix(pw);
    const det = determinantMod(key, MODULUS);
    assert.equal(det % 2, 1, `det must be odd for password "${pw}" (got ${det})`);
    // and therefore invertible:
    assert.doesNotThrow(() => matrixInverseMod(key, MODULUS));
  }
});

test('generateKeyMatrix is deterministic and password-sensitive', () => {
  assert.deepEqual(generateKeyMatrix('secret'), generateKeyMatrix('secret'));
  assert.notDeepEqual(generateKeyMatrix('secret'), generateKeyMatrix('Secret'));
});

test('key matrix entries are valid bytes', () => {
  const key = generateKeyMatrix('any password');
  for (const row of key) {
    for (const v of row) {
      assert.ok(Number.isInteger(v) && v >= 0 && v < 256);
    }
  }
});

// ---------------------------------------------------------------------------
// Modular arithmetic
// ---------------------------------------------------------------------------

test('modularInverse returns a working inverse for all odd values mod 256', () => {
  for (let a = 1; a < 256; a += 2) {
    const inv = modularInverse(a, 256);
    assert.notEqual(inv, null, `odd ${a} must be invertible`);
    assert.equal((a * inv) % 256, 1);
  }
});

test('modularInverse returns null for non-coprime values', () => {
  for (const a of [0, 2, 4, 128, 100]) {
    assert.equal(modularInverse(a, 256), null);
  }
});

test('modularInverse handles negative inputs', () => {
  const inv = modularInverse(-3, 256); // -3 === 253 mod 256
  assert.equal((253 * inv) % 256, 1);
});

test('matrixInverseMod: K * K^-1 === identity mod 256', () => {
  for (const pw of ['x', 'y', 'z', 'longer password here']) {
    const key = generateKeyMatrix(pw);
    const inv = matrixInverseMod(key, 256);
    const product = [
      [
        (key[0][0] * inv[0][0] + key[0][1] * inv[1][0]) % 256,
        (key[0][0] * inv[0][1] + key[0][1] * inv[1][1]) % 256,
      ],
      [
        (key[1][0] * inv[0][0] + key[1][1] * inv[1][0]) % 256,
        (key[1][0] * inv[0][1] + key[1][1] * inv[1][1]) % 256,
      ],
    ];
    assert.deepEqual(product, [[1, 0], [0, 1]]);
  }
});

test('matrixInverseMod throws for a singular matrix', () => {
  assert.throws(() => matrixInverseMod([[2, 4], [1, 2]], 256));
});

// ---------------------------------------------------------------------------
// Block operations
// ---------------------------------------------------------------------------

test('encryptBlock/decryptBlock round-trip every possible byte pair boundary', () => {
  const key = generateKeyMatrix('block-test');
  const inv = matrixInverseMod(key, 256);
  const samples = [
    [0, 0], [255, 255], [0, 255], [255, 0], [1, 1], [127, 128], [42, 200],
  ];
  for (const block of samples) {
    const c = encryptBlock(block, key);
    const p = decryptBlock(c, inv);
    assert.deepEqual(p, block);
  }
});

// ---------------------------------------------------------------------------
// processImage on raw buffers
// ---------------------------------------------------------------------------

test('processImage round-trips an even-length buffer exactly', () => {
  const key = generateKeyMatrix('buffer-test');
  const original = Buffer.from(Array.from({ length: 1000 }, (_, i) => (i * 37) % 256));
  const cipher = processImage(original, key, 'encrypt');
  const plain = processImage(cipher, key, 'decrypt');
  assert.deepEqual(plain, original);
});

test('processImage pads odd-length input and round-trips after trim', () => {
  const key = generateKeyMatrix('odd-length');
  const original = Buffer.from([10, 20, 30, 40, 50]); // length 5 (odd)
  const cipher = processImage(original, key, 'encrypt');
  assert.equal(cipher.length, 6, 'ciphertext padded to even length');
  const plain = processImage(cipher, key, 'decrypt').subarray(0, original.length);
  assert.deepEqual(plain, original);
});

test('processImage actually changes the data (no identity leak)', () => {
  const key = generateKeyMatrix('scramble-check');
  const original = Buffer.alloc(512, 170);
  const cipher = processImage(original, key, 'encrypt');
  assert.notDeepEqual(cipher, original);
});

test('processImage rejects unknown modes and odd-length ciphertext', () => {
  const key = generateKeyMatrix('errors');
  assert.throws(() => processImage(Buffer.from([1, 2]), key, 'banana'));
  assert.throws(() => processImage(Buffer.from([1, 2, 3]), key, 'decrypt'));
});

// ---------------------------------------------------------------------------
// .enc binary format
// ---------------------------------------------------------------------------

test('.enc build/parse round-trips header fields byte-exactly', () => {
  const ciphertext = Buffer.from(Array.from({ length: 12 }, (_, i) => i)); // 2x2 image: 4px -> 4 padded -> 12 total
  const enc = buildEncFile({ width: 2, height: 2, format: 'png', ciphertext });
  assert.equal(enc.toString('ascii', 0, 4), 'ENC1');
  const parsed = parseEncFile(enc);
  assert.equal(parsed.width, 2);
  assert.equal(parsed.height, 2);
  assert.equal(parsed.format, 'png');
  assert.deepEqual(parsed.ciphertext, ciphertext);
});

test('parseEncFile rejects corrupted input', () => {
  assert.throws(() => parseEncFile(Buffer.from('short')), /too small/i);
  assert.throws(() => parseEncFile(Buffer.alloc(64, 0)), /magic/i);

  const good = buildEncFile({
    width: 2,
    height: 2,
    format: 'png',
    ciphertext: Buffer.alloc(12),
  });
  assert.throws(() => parseEncFile(good.subarray(0, good.length - 3)), /size|corrupt/i);

  const zeroDim = buildEncFile({ width: 0, height: 5, format: 'png', ciphertext: Buffer.alloc(0) });
  assert.throws(() => parseEncFile(zeroDim), /dimensions/i);
});

// ---------------------------------------------------------------------------
// Full image round-trips (sharp-backed), across sizes and edge cases
// ---------------------------------------------------------------------------

/** Deterministic noise image of the given size. */
async function makeTestImage(width, height, format = 'png') {
  const raw = Buffer.allocUnsafe(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 101 + 7) % 256;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .toFormat(format)
    .toBuffer();
}

async function rawPixels(imageBuffer) {
  return sharp(imageBuffer).removeAlpha().raw().toBuffer();
}

for (const [w, h, label] of [
  [1, 1, '1x1 (single pixel, odd channel length -> padding)'],
  [2, 2, '2x2 (single block per channel)'],
  [3, 3, '3x3 (odd pixel count -> padding)'],
  [5, 7, '5x7 (odd dimensions)'],
  [64, 48, '64x48 (typical small image)'],
  [101, 33, '101x33 (odd width)'],
]) {
  test(`encrypt -> decrypt round-trip returns original pixels: ${label}`, async () => {
    const original = await makeTestImage(w, h, 'png');
    const originalPixels = await rawPixels(original);

    const { encBuffer } = await encryptImage(original, 'demo-password-123');
    const { imageBuffer, width, height } = await decryptEnc(encBuffer, 'demo-password-123');

    assert.equal(width, w);
    assert.equal(height, h);
    const decryptedPixels = await rawPixels(imageBuffer);
    assert.deepEqual(decryptedPixels, originalPixels, 'pixel data must match exactly');
  });
}

test('encrypted ciphertext differs from plaintext pixels', async () => {
  const original = await makeTestImage(16, 16);
  const { channels } = await decodeToChannels(original);
  const { encBuffer } = await encryptImage(original, 'pw');
  const { ciphertext } = parseEncFile(encBuffer);
  assert.notDeepEqual(ciphertext.subarray(0, 256), channels.r);
});

test('wrong password fails decryption (output is not the original)', async () => {
  const original = await makeTestImage(32, 32);
  const originalPixels = await rawPixels(original);

  const { encBuffer } = await encryptImage(original, 'correct-password');
  const { imageBuffer } = await decryptEnc(encBuffer, 'wrong-password');
  const wrongPixels = await rawPixels(imageBuffer);

  assert.notDeepEqual(wrongPixels, originalPixels, 'wrong password must not recover the image');

  // ...and quantitatively: the output should be noise, not a near-miss.
  let differing = 0;
  for (let i = 0; i < originalPixels.length; i++) {
    if (originalPixels[i] !== wrongPixels[i]) differing++;
  }
  assert.ok(
    differing / originalPixels.length > 0.9,
    `expected >90% of bytes to differ, got ${((differing / originalPixels.length) * 100).toFixed(1)}%`
  );
});

test('jpeg source: format preserved through the .enc container', async () => {
  const original = await makeTestImage(20, 20, 'jpeg');
  const { encBuffer } = await encryptImage(original, 'pw');
  const parsed = parseEncFile(encBuffer);
  assert.equal(parsed.format, 'jpeg');
  const { format, imageBuffer } = await decryptEnc(encBuffer, 'pw');
  assert.equal(format, 'jpeg');
  const meta = await sharp(imageBuffer).metadata();
  assert.equal(meta.format, 'jpeg');
});

test('decryptEnc rejects garbage input with a clear error', async () => {
  await assert.rejects(() => decryptEnc(Buffer.from('this is not an enc file at all'), 'pw'), /magic|too small/i);
});
