import { createClient } from "@supabase/supabase-js";

// These come from your .env file (see .env.example).
// If they're absent, the app runs in LOCAL mode (browser storage, no login).
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const CLOUD_ENABLED = Boolean(url && key);
export const supabase = CLOUD_ENABLED ? createClient(url, key) : null;
