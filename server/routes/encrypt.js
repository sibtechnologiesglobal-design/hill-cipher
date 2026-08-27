'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { encryptImage } = require('../lib/imageProcessor');
const { supabase, isConfigured } = require('../lib/supabaseClient');

const router = express.Router();

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
]);
const ALLOWED_IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff', '.avif',
]);

// Memory storage: uploads never touch disk, so there is nothing to clean up
// or leak after the response is sent. 4 MB cap matches Vercel's request
// body limit (~4.5 MB on Hobby) so local and deployed behavior agree.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(file.mimetype) || !ALLOWED_IMAGE_EXTS.has(ext)) {
      const err = new Error('Only image files are accepted for encryption (png, jpeg, webp, gif, tiff, avif)');
      err.status = 415;
      return cb(err);
    }
    cb(null, true);
  },
});

/**
 * Best-effort persistence to Supabase: upload the ciphertext and record
 * metadata (never the password, key, or plaintext). A storage failure must
 * never break the user's download — log it and move on.
 */
async function persistEncryption(encBuffer, originalFilename) {
  if (!isConfigured) return;
  try {
    const storagePath = `${crypto.randomUUID()}.enc`;
    const { error: uploadError } = await supabase.storage
      .from('encrypted-files')
      .upload(storagePath, encBuffer, { contentType: 'application/octet-stream' });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from('encryption_history').insert({
      original_filename: originalFilename,
      storage_path: storagePath,
      file_size_bytes: encBuffer.length,
    });
    if (insertError) throw insertError;
  } catch (err) {
    console.error('Supabase persistence failed (encryption still succeeded):', err.message || err);
  }
}

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided (field name: "image")' });
    }
    const password = req.body.password;
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const { encBuffer, width, height, format } = await encryptImage(req.file.buffer, password);

    // Awaited (serverless platforms may kill work after the response), but
    // failures are swallowed inside so the download never depends on storage.
    await persistEncryption(encBuffer, req.file.originalname);

    const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname)) || 'image';
    res
      .status(200)
      .set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${baseName}.enc"`,
        'X-Enc-Meta': JSON.stringify({ width, height, format }),
      })
      .send(encBuffer);
  } catch (err) {
    // sharp throws on undecodable/corrupt image data
    if (/unsupported image format|input buffer/i.test(err.message)) {
      err.status = 415;
      err.message = 'Could not decode the uploaded file as an image';
    }
    next(err);
  }
});

module.exports = router;
