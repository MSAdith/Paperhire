import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabaseClient.js";
import { UNAUTHENTICATED_EVENT } from "./api.js";

// Sign-in state for the whole app. Sessions are kept by Supabase in
// localStorage, so users stay signed in across visits until they sign out.
const AuthContext = createContext(null);

function toUser(u) {
  if (!u) return null;
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || "",
    name: meta.full_name || meta.name || "",
    avatarUrl: meta.avatar_url || meta.picture || "",
    provider: u.app_metadata?.provider || "email"
  };
}

// Records sign_up / sign_in once per real sign-in (the server de-duplicates
// refreshed sessions). Analytics only: failures are ignored.
async function recordSignIn(session) {
  try {
    await fetch("/api/events/auth", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, configured: true, user: null });

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    getSupabase().then(async (supabase) => {
      if (cancelled) return;
      if (!supabase) {
        setState({ ready: true, configured: false, user: null });
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setState({ ready: true, configured: true, user: toUser(data.session?.user) });

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        setState((s) => ({ ...s, ready: true, user: toUser(session?.user) }));
        if (event === "SIGNED_IN" && session) recordSignIn(session);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await getSupabase();
    if (supabase) await supabase.auth.signOut();
    setState((s) => ({ ...s, user: null }));
  }, []);

  // An API call came back 401: the session expired or was revoked.
  useEffect(() => {
    const onUnauthenticated = () => setState((s) => (s.user ? { ...s, user: null, expired: true } : s));
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = await getSupabase();
    if (!supabase) throw new Error("Sign-in isn't configured yet.");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` }
    });
    if (error) throw error;
  }, []);

  // Magic link. createAccount=false (the sign-in screen) won't create a new
  // account for an unknown email, so a typo doesn't silently sign someone up.
  const sendMagicLink = useCallback(async (email, { createAccount }) => {
    const supabase = await getSupabase();
    if (!supabase) throw new Error("Sign-in isn't configured yet.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: createAccount, emailRedirectTo: `${window.location.origin}/` }
    });
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({ ...state, signOut, signInWithGoogle, sendMagicLink }),
    [state, signOut, signInWithGoogle, sendMagicLink]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
