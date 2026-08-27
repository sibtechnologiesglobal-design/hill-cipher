'use strict';

const express = require('express');
const { supabase, isConfigured } = require('../lib/supabaseClient');

const router = express.Router();

/**
 * GET /api/history — the 10 most recent encryptions.
 * Returns metadata only (filename, size, timestamp); storage paths and file
 * contents stay server-side. When Supabase isn't configured, responds with
 * an empty list and configured:false so the frontend can hide the feature.
 */
router.get('/', async (req, res, next) => {
  if (!isConfigured) {
    return res.json({ configured: false, items: [] });
  }
  try {
    const { data, error } = await supabase
      .from('encryption_history')
      .select('original_filename, file_size_bytes, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    // Explicit mapping so storage paths can never leak, regardless of what
    // the query returns.
    const items = (data || []).map((row) => ({
      original_filename: row.original_filename,
      file_size_bytes: row.file_size_bytes,
      created_at: row.created_at,
    }));
    res.json({ configured: true, items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
