import { createClient } from "@supabase/supabase-js";

// The browser's Supabase client. The project URL and anon (public) key come
// from the server's /api/config at runtime, so no secrets are baked into the
// bundle and the same build works locally and on Vercel.
let clientPromise = null;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        if (!config || !config.authConfigured) return null;
        return createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
      })
      .catch(() => null);
  }
  return clientPromise;
}

// Current access token for API calls, or "" when signed out.
export async function getAccessToken() {
  const supabase = await getSupabase();
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}
