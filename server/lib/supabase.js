import { createClient } from "@supabase/supabase-js";

// Server-side Supabase access. Uses the service-role key, which bypasses
// row-level security, so this module must only ever run on the server and the
// key must never be sent to the browser (the client gets the anon key from
// /api/config instead).

let adminClient = null;
let adminClientKey = "";

const clean = (v) => (typeof v === "string" ? v.trim() : "");

export function getSupabaseConfig() {
  return {
    url: clean(process.env.SUPABASE_URL),
    anonKey: clean(process.env.SUPABASE_ANON_KEY),
    serviceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

// True when the server can verify sign-ins and write analytics events.
export function isSupabaseConfigured() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return Boolean(url && serviceRoleKey);
}

export function getSupabaseAdmin() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) return null;
  const key = `${url}|${serviceRoleKey}`;
  if (!adminClient || adminClientKey !== key) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    adminClientKey = key;
  }
  return adminClient;
}

// Emails allowed into /admin, from ADMIN_EMAILS (comma-separated, case-insensitive).
export function getAdminEmails() {
  return clean(process.env.ADMIN_EMAILS)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email) {
  if (!email) return false;
  return getAdminEmails().includes(String(email).trim().toLowerCase());
}
