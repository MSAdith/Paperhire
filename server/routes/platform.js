import express from "express";
import { getSupabaseConfig, isAdminEmail } from "../lib/supabase.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { cleanPath, eventContextFrom, trackEvent } from "../lib/events.js";
import { fetchAllEvents, fetchAllUsers, fetchLastAuthEvent } from "../lib/adminData.js";
import { computeDashboard, RANGES } from "../lib/adminStats.js";
import { getStores } from "../lib/stores.js";

// Auth and access control for these routes is enforced by apiAuthGate in
// app.js: /api/config and /api/events/page-view are public, /api/events/auth
// needs a signed-in user, and /api/admin/* needs an ADMIN_EMAILS address.

const router = express.Router();

// Public: what the browser needs to start Supabase Auth. Only the project URL
// and the anon (public) key; the service-role key never leaves the server.
router.get("/config", (req, res) => {
  const { url, anonKey } = getSupabaseConfig();
  res.json({ authConfigured: Boolean(url && anonKey), supabaseUrl: url || null, supabaseAnonKey: anonKey || null });
});

const pageViewLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60, message: "Too many page views." });

router.post("/events/page-view", pageViewLimiter, (req, res) => {
  const path = cleanPath(req.body?.path);
  if (!path) return res.status(400).json({ error: "path is required." });
  trackEvent({ ...eventContextFrom(req), type: "page_view", path });
  return res.status(204).end();
});

// A repeat sign-in within this window (e.g. a refreshed session) isn't counted again.
const SIGN_IN_DEDUPE_MS = 30 * 60 * 1000;

router.post("/events/auth", async (req, res) => {
  try {
    const last = await fetchLastAuthEvent(req.user.id);
    if (last && Date.now() - new Date(last.created_at).getTime() < SIGN_IN_DEDUPE_MS) {
      return res.json({ recorded: null });
    }
    const type = last ? "sign_in" : "sign_up";
    await trackEvent({ ...eventContextFrom(req), type, name: req.user.provider });
    return res.json({ recorded: type });
  } catch (err) {
    console.warn("Auth event error:", err.message);
    return res.json({ recorded: null });
  }
});

// --- Admin (requireAdmin already ran in the gate) ---
router.get("/admin/me", (req, res) => {
  res.json({ admin: isAdminEmail(req.user.email), email: req.user.email });
});

router.get("/admin/summary", async (req, res) => {
  const range = Object.prototype.hasOwnProperty.call(RANGES, req.query.range) ? req.query.range : "30d";
  try {
    const [events, users, feedback] = await Promise.all([fetchAllEvents(), fetchAllUsers(), getStores().feedback.all()]);
    return res.json(computeDashboard(events, users, { range, feedback }));
  } catch (err) {
    console.error("Admin summary error:", err.message);
    return res.status(500).json({ error: "Could not load analytics. Check that the events table exists (see supabase/migrations)." });
  }
});

export default router;
