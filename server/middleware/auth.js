import crypto from "crypto";
import { getSupabaseAdmin, isSupabaseConfigured, isAdminEmail } from "../lib/supabase.js";

// Verified tokens are cached briefly so each request doesn't round-trip to
// Supabase. Keys are SHA-256 hashes, so raw tokens are never held in memory maps.
const TOKEN_CACHE_TTL_MS = 60 * 1000;
const TOKEN_CACHE_MAX = 1000;
const tokenCache = new Map();

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export function clearTokenCache() {
  tokenCache.clear();
}

export function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function toAppUser(user) {
  const meta = user.user_metadata || {};
  const appMeta = user.app_metadata || {};
  return {
    id: user.id,
    email: user.email || "",
    name: meta.full_name || meta.name || "",
    avatarUrl: meta.avatar_url || meta.picture || "",
    provider: appMeta.provider || "email",
    createdAt: user.created_at || null
  };
}

// Returns the signed-in user for a Supabase access token, or null.
export async function verifyAccessToken(token) {
  if (!token) return null;
  const key = hashToken(token);
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.user;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    const user = toAppUser(data.user);
    if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.delete(tokenCache.keys().next().value);
    tokenCache.set(key, { user, expires: Date.now() + TOKEN_CACHE_TTL_MS });
    return user;
  } catch (err) {
    console.warn("Auth: token verification failed:", err.message);
    return null;
  }
}

// Attaches req.user when a valid token is present; never rejects.
export async function optionalAuth(req, res, next) {
  req.user = (await verifyAccessToken(bearerToken(req))) || null;
  next();
}

export async function requireAuth(req, res, next) {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({
      error: "Sign-in isn't configured on this server yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable it.",
      code: "auth_not_configured"
    });
  }
  const user = await verifyAccessToken(bearerToken(req));
  if (!user) {
    return res.status(401).json({ error: "Please sign in to use this feature.", code: "unauthenticated" });
  }
  req.user = user;
  next();
}

// Must run after requireAuth. Admin access is decided here on the server from
// ADMIN_EMAILS; the client only uses the result to decide what to show.
export function requireAdmin(req, res, next) {
  if (!req.user || !isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: "Not found.", code: "forbidden" });
  }
  next();
}

// Default-deny gate for everything under /api (and the legacy /analyze alias):
// any path not in PUBLIC_PATHS requires a valid session, and /api/admin/*
// additionally requires an admin email. New endpoints are protected
// automatically, without having to remember to add a middleware.
export const PUBLIC_PATHS = new Set(["/api/health", "/health", "/api/config", "/api/events/page-view"]);

export function apiAuthGate(req, res, next) {
  const path = req.path.replace(/\/+$/, "") || "/";
  const isApi = path.startsWith("/api/") || path === "/analyze";
  if (!isApi || req.method === "OPTIONS") return next();

  if (PUBLIC_PATHS.has(path)) {
    return path === "/api/events/page-view" ? optionalAuth(req, res, next) : next();
  }

  return requireAuth(req, res, () => {
    if (path.startsWith("/api/admin")) return requireAdmin(req, res, next);
    return next();
  });
}
