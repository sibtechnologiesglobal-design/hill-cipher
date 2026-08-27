'use strict';

/**
 * Supabase client (service role — server-side only, bypasses RLS).
 *
 * Persistence is optional: when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
 * not set, the app runs with history disabled instead of crashing. This keeps
 * local dev and offline demos working with zero configuration.
 */

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isConfigured = Boolean(url && serviceRoleKey);
const supabase = isConfigured ? createClient(url, serviceRoleKey) : null;

module.exports = { supabase, isConfigured };
