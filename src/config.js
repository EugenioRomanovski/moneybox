// Public Supabase settings of the shared "encore" project (publishable key — safe for the browser,
// data is protected by Row Level Security). Can be overridden with VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://uvuifuyozscfcowuxdtr.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_gD0M11LHLg4PJWxA8rKatQ_zn69qbw_';
