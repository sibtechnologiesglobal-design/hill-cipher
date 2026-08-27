'use strict';

/**
 * Image-level orchestration around the pure Hill cipher core.
 * This is the only module that touches sharp.
 */

const sharp = require('sharp');
const {
  generateKeyMatrix,
  processImage,
  buildEncFile,
  parseEncFile,
} = require('./hillcipher');

/** Formats we can faithfully re-encode with sharp on decrypt. */
const ENCODABLE_FORMATS = new Set(['png', 'jpeg', 'webp', 'tiff', 'gif', 'avif']);

/**
 * Decode an image buffer into separate R, G, B channel buffers.
 * Alpha is dropped; grayscale is expanded to RGB so the cipher always
 * operates on exactly three channels.
 */
async function decodeToChannels(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixelCount = width * height;
  const r = Buffer.allocUnsafe(pixelCount);
  const g = Buffer.allocUnsafe(pixelCount);
  const b = Buffer.allocUnsafe(pixelCount);

  if (channels === 1) {
    for (let i = 0; i < pixelCount; i++) {
      r[i] = g[i] = b[i] = data[i];
    }
  } else {
    for (let i = 0; i < pixelCount; i++) {
      r[i] = data[i * channels];
      g[i] = data[i * channels + 1];
      b[i] = data[i * channels + 2];
    }
  }

  const format = ENCODABLE_FORMATS.has(meta.format) ? meta.format : 'png';
  return { width, height, format, channels: { r, g, b } };
}

/** Interleave R, G, B channel buffers back into RGB pixel data. */
function interleave(r, g, b, pixelCount) {
  const out = Buffer.allocUnsafe(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    out[i * 3] = r[i];
    out[i * 3 + 1] = g[i];
    out[i * 3 + 2] = b[i];
  }
  return out;
}

/**
 * Encrypt an image buffer with a password.
 * Returns { encBuffer, keyMatrix, width, height, format }.
 */
async function encryptImage(imageBuffer, password) {
  const key = generateKeyMatrix(password);
  const { width, height, format, channels } = await decodeToChannels(imageBuffer);

  const encrypted = ['r', 'g', 'b'].map((ch) =>
    processImage(channels[ch], key, 'encrypt')
  );

  const encBuffer = buildEncFile({
    width,
    height,
    format,
    ciphertext: Buffer.concat(encrypted),
  });
  return { encBuffer, keyMatrix: key, width, height, format };
}

/**
 * Decrypt a .enc buffer with a password.
 * Structural problems (bad magic, truncation) throw; a wrong password
 * does NOT throw — the Hill cipher simply produces noise, which is the
 * mathematically honest behavior for a cipher with no integrity check.
 *
 * Returns { imageBuffer, format, width, height, keyMatrix, mimeType }.
 */
async function decryptEnc(encBuffer, password) {
  const { width, height, format, ciphertext } = parseEncFile(encBuffer);
  const key = generateKeyMatrix(password);

  const pixelCount = width * height;
  const paddedLength = Math.ceil(pixelCount / 2) * 2;

  const channels = [];
  for (let c = 0; c < 3; c++) {
    const slice = ciphertext.subarray(c * paddedLength, (c + 1) * paddedLength);
    const decrypted = processImage(slice, key, 'decrypt');
    channels.push(decrypted.subarray(0, pixelCount)); // trim padding
  }

  const rgb = interleave(channels[0], channels[1], channels[2], pixelCount);
  const encoder = sharp(rgb, { raw: { width, height, channels: 3 } });

  const outputFormat = ENCODABLE_FORMATS.has(format) ? format : 'png';
  const imageBuffer = await encoder.toFormat(outputFormat).toBuffer();

  return {
    imageBuffer,
    format: outputFormat,
    width,
    height,
    keyMatrix: key,
    mimeType: `image/${outputFormat}`,
  };
}

module.exports = { encryptImage, decryptEnc, decodeToChannels, ENCODABLE_FORMATS };
