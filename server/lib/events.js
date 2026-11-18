import { getSupabaseAdmin } from "./supabase.js";

// Analytics events. Only the fields below are ever stored, each capped in
// length, and never any resume text, job description text or AI output.
// Events are written fire-and-forget: tracking can never slow down or break a
// user request.

export const EVENT_TYPES = ["page_view", "sign_up", "sign_in", "feature_used", "ai_call", "error"];

export const FEATURES = [
  "ats_analyze",
  "job_search",
  "tailor",
  "cover_letter",
  "interview_prep",
  "skill_gap",
  "download_pdf",
  "download_docx",
  "reach_out",
  "tracker_add",
  "tracker_move"
];

export const AI_RESULTS = ["success", "failed", "rate_limited", "out_of_credits"];

// Field -> max length. Anything else is dropped.
const STRING_FIELDS = {
  type: 20,
  name: 40,
  path: 120,
  result: 20,
  route: 80,
  error_type: 60,
  user_id: 64,
  visitor_id: 64,
  device: 20,
  browser: 30,
  country: 4,
  city: 60
};

const SAFE_TOKEN = /^[A-Za-z0-9_.:\-/ ]*$/;

function cleanString(value, max) {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value).trim().slice(0, max);
  return s || null;
}

// Normalises a page path: no query string or fragment, no odd characters.
export function cleanPath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  const p = path.split(/[?#]/)[0].slice(0, STRING_FIELDS.path);
  return /^\/[A-Za-z0-9/_\-.]*$/.test(p) ? p : "/other";
}

// Builds a storable event from untrusted input using a strict allowlist.
export function sanitizeEvent(input = {}) {
  const event = {};
  if (!EVENT_TYPES.includes(input.type)) return null;

  for (const [field, max] of Object.entries(STRING_FIELDS)) {
    const v = cleanString(input[field], max);
    if (v !== null) event[field] = v;
  }

  // Free-text-looking values are rejected outright for the label fields.
  for (const field of ["name", "result", "route", "error_type", "device", "browser"]) {
    if (event[field] && !SAFE_TOKEN.test(event[field])) delete event[field];
  }
  if (event.visitor_id && !/^[A-Za-z0-9-]{8,64}$/.test(event.visitor_id)) delete event.visitor_id;
  if (event.user_id && !/^[0-9a-f-]{8,64}$/i.test(event.user_id)) delete event.user_id;
  if (event.country && !/^[A-Z]{2}$/i.test(event.country)) delete event.country;
  if (event.path !== undefined) {
    const p = cleanPath(event.path);
    if (p) event.path = p;
    else delete event.path;
  }
  if (event.type === "feature_used" && !FEATURES.includes(event.name)) return null;
  if (event.type === "ai_call" && event.result && !AI_RESULTS.includes(event.result)) delete event.result;

  if (Number.isFinite(input.duration_ms) && input.duration_ms >= 0) {
    event.duration_ms = Math.min(Math.round(input.duration_ms), 10 * 60 * 1000);
  }

  return event;
}

// --- Sink (where events go). Tests swap this for an in-memory array. ---
async function supabaseSink(event) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from("events").insert(event);
  if (error) console.warn("Analytics: could not store event:", error.message);
}

let sink = supabaseSink;

export function setEventSink(fn) {
  sink = fn || supabaseSink;
}

export function trackEvent(input) {
  const event = sanitizeEvent(input);
  if (!event) return Promise.resolve(null);
  return Promise.resolve()
    .then(() => sink(event))
    .then(() => event)
    .catch((err) => {
      console.warn("Analytics: event dropped:", err.message);
      return null;
    });
}

// --- Request context: who/where/what device, never what content. ---
export function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const VISITOR_COOKIE = "ph_vid";

export function deviceType(ua = "") {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return "mobile";
  if (/bot|crawl|spider|slurp|headless/i.test(ua)) return "bot";
  return ua ? "desktop" : null;
}

export function browserName(ua = "") {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios|chromium/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return ua ? "Other" : null;
}

function headerValue(req, name) {
  const v = req.headers[name];
  if (!v) return null;
  try {
    return decodeURIComponent(Array.isArray(v) ? v[0] : v);
  } catch {
    return null;
  }
}

export function eventContextFrom(req) {
  const ua = req.headers["user-agent"] || "";
  const cookies = parseCookies(req.headers.cookie || "");
  return {
    user_id: req.user?.id || null,
    visitor_id: cookies[VISITOR_COOKIE] || null,
    device: deviceType(ua),
    browser: browserName(ua),
    country: headerValue(req, "x-vercel-ip-country"),
    city: headerValue(req, "x-vercel-ip-city")
  };
}

export const trackFeature = (context, name, extra = {}) => trackEvent({ ...context, ...extra, type: "feature_used", name });

export const trackError = (context, route, errorType) =>
  trackEvent({ ...context, type: "error", route, error_type: errorType || "unknown" });

// Maps generateJSON's reasons to the four AI health buckets.
export function aiResultFromReason(reason) {
  if (!reason || reason === "ok") return "success";
  if (reason === "rate_limited") return "rate_limited";
  if (reason === "no_credits") return "out_of_credits";
  return "failed";
}

export const trackAiCall = (context, name, reason, durationMs) =>
  trackEvent({ ...context, type: "ai_call", name, result: aiResultFromReason(reason), duration_ms: durationMs });
