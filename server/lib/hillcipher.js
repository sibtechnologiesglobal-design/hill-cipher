'use strict';

/**
 * Hill cipher core — pure functions, no I/O, no image dependencies.
 *
 * The cipher works over Z_256 (byte values). A 2x2 key matrix K is
 * invertible mod 256 iff gcd(det(K), 256) = 1, i.e. iff det(K) is odd.
 */

const crypto = require('crypto');

const MODULUS = 256;
const MAGIC = 'ENC1';

/** Proper mathematical modulo (result always in [0, m)). */
function mod(n, m) {
  return ((n % m) + m) % m;
}

/**
 * Derive a 2x2 key matrix from a password.
 *
 * SHA-256(password) gives 32 bytes; the first four seed the matrix
 * [[a, b], [c, d]]. Parity is then forced so the determinant is odd:
 *   a, d forced odd  -> a*d is odd
 *   b forced even    -> b*c is even
 *   det = a*d - b*c  -> odd - even = odd, always invertible mod 256.
 */
function generateKeyMatrix(password) {
  const hash = crypto.createHash('sha256').update(String(password), 'utf8').digest();
  const a = hash[0] | 1;
  const b = hash[1] & 0xfe;
  const c = hash[2];
  const d = hash[3] | 1;
  return [
    [a, b],
    [c, d],
  ];
}

/**
 * Modular multiplicative inverse via the extended Euclidean algorithm.
 * Returns x such that (a * x) % m === 1, or null if gcd(a, m) !== 1.
 */
function modularInverse(a, m) {
  a = mod(a, m);
  let [oldR, r] = [a, m];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1) return null;
  return mod(oldS, m);
}

/** Determinant of a 2x2 matrix, reduced mod m. */
function determinantMod(matrix, m) {
  const [[a, b], [c, d]] = matrix;
  return mod(a * d - b * c, m);
}

/**
 * Inverse of a 2x2 matrix mod m, via the adjugate:
 *   K^-1 = det(K)^-1 * adj(K)   where adj([[a,b],[c,d]]) = [[d,-b],[-c,a]]
 * Throws if the matrix is not invertible mod m.
 */
function matrixInverseMod(matrix, m) {
  const [[a, b], [c, d]] = matrix;
  const det = determinantMod(matrix, m);
  const detInv = modularInverse(det, m);
  if (detInv === null) {
    throw new Error(`Matrix is not invertible mod ${m} (det = ${det})`);
  }
  return [
    [mod(d * detInv, m), mod(-b * detInv, m)],
    [mod(-c * detInv, m), mod(a * detInv, m)],
  ];
}

/** C = (K x P) mod 256, where block is a length-2 vector [p0, p1]. */
function encryptBlock(block, key) {
  const [p0, p1] = block;
  return [
    mod(key[0][0] * p0 + key[0][1] * p1, MODULUS),
    mod(key[1][0] * p0 + key[1][1] * p1, MODULUS),
  ];
}

/** P = (K^-1 x C) mod 256. Pass the *inverse* key matrix. */
function decryptBlock(block, inverseKey) {
  return encryptBlock(block, inverseKey);
}

/**
 * Apply the cipher to a raw byte buffer (one image channel, or any data).
 *
 * mode 'encrypt': pads the buffer with a trailing 0 if its length is odd,
 *                 then transforms each consecutive pair with K.
 * mode 'decrypt': requires an even-length buffer (ciphertext is always
 *                 even), transforms each pair with K^-1. The caller trims
 *                 any padding using the known original length.
 *
 * Returns a new Buffer; the input is never mutated.
 */
function processImage(buffer, key, mode) {
  if (mode !== 'encrypt' && mode !== 'decrypt') {
    throw new Error(`Unknown mode "${mode}" (expected "encrypt" or "decrypt")`);
  }

  let data = buffer;
  if (mode === 'encrypt' && buffer.length % 2 !== 0) {
    data = Buffer.concat([buffer, Buffer.from([0])]);
  }
  if (mode === 'decrypt' && buffer.length % 2 !== 0) {
    throw new Error('Ciphertext length must be even');
  }

  const matrix = mode === 'encrypt' ? key : matrixInverseMod(key, MODULUS);
  const out = Buffer.allocUnsafe(data.length);

  const k00 = matrix[0][0];
  const k01 = matrix[0][1];
  const k10 = matrix[1][0];
  const k11 = matrix[1][1];

  for (let i = 0; i < data.length; i += 2) {
    const p0 = data[i];
    const p1 = data[i + 1];
    out[i] = (k00 * p0 + k01 * p1) % MODULUS;
    out[i + 1] = (k10 * p0 + k11 * p1) % MODULUS;
  }
  return out;
}

/**
 * Pack the custom .enc binary format:
 *   [0..3]   "ENC1" magic
 *   [4..7]   width  (uint32 LE)
 *   [8..11]  height (uint32 LE)
 *   [12]     format string length (1 byte)
 *   [13..]   format string (ascii, e.g. "png")
 *   [...]    ciphertext
 */
function buildEncFile({ width, height, format, ciphertext }) {
  const formatBytes = Buffer.from(format, 'ascii');
  if (formatBytes.length > 255) throw new Error('Format string too long');
  const header = Buffer.alloc(13);
  header.write(MAGIC, 0, 'ascii');
  header.writeUInt32LE(width, 4);
  header.writeUInt32LE(height, 8);
  header.writeUInt8(formatBytes.length, 12);
  return Buffer.concat([header, formatBytes, ciphertext]);
}

/**
 * Parse and validate a .enc buffer. Throws with a descriptive message on
 * any structural problem (bad magic, truncation, size mismatch).
 */
function parseEncFile(buffer) {
  if (buffer.length < 14) {
    throw new Error('File too small to be a valid .enc file');
  }
  if (buffer.toString('ascii', 0, 4) !== MAGIC) {
    throw new Error('Invalid .enc file: bad magic bytes (expected "ENC1")');
  }
  const width = buffer.readUInt32LE(4);
  const height = buffer.readUInt32LE(8);
  const formatLength = buffer.readUInt8(12);
  if (buffer.length < 13 + formatLength) {
    throw new Error('Corrupted .enc file: truncated header');
  }
  const format = buffer.toString('ascii', 13, 13 + formatLength);
  const ciphertext = buffer.subarray(13 + formatLength);

  if (width === 0 || height === 0) {
    throw new Error('Corrupted .enc file: zero image dimensions');
  }
  // Per channel: w*h bytes padded up to even; three channels concatenated.
  const paddedChannelLength = Math.ceil((width * height) / 2) * 2;
  if (ciphertext.length !== paddedChannelLength * 3) {
    throw new Error(
      `Corrupted .enc file: ciphertext size ${ciphertext.length} does not match ` +
        `expected ${paddedChannelLength * 3} for ${width}x${height} RGB`
    );
  }
  return { width, height, format, ciphertext };
}

module.exports = {
  MODULUS,
  MAGIC,
  mod,
  generateKeyMatrix,
  modularInverse,
  determinantMod,
  matrixInverseMod,
  encryptBlock,
  decryptBlock,
  processImage,
  buildEncFile,
  parseEncFile,
};
