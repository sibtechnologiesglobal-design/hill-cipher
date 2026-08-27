'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const { decryptEnc } = require('../lib/imageProcessor');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.enc') {
      const err = new Error('Only .enc files are accepted for decryption');
      err.status = 415;
      return cb(err);
    }
    cb(null, true);
  },
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No .enc file provided (field name: "file")' });
    }
    const password = req.body.password;
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const { imageBuffer, format, width, height, mimeType } = await decryptEnc(
      req.file.buffer,
      password
    );

    const baseName = path.basename(req.file.originalname, '.enc') || 'decrypted';
    res
      .status(200)
      .set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${baseName}.${format}"`,
        'X-Enc-Meta': JSON.stringify({ width, height, format }),
      })
      .send(imageBuffer);
  } catch (err) {
    // Structural .enc validation errors are client errors, not server faults.
    if (/\.enc file|magic|dimensions|ciphertext|too small/i.test(err.message)) {
      err.status = 400;
    }
    next(err);
  }
});

module.exports = router;
