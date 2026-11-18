import { eventContextFrom, trackError, trackFeature } from "../lib/events.js";

// Endpoint -> feature name for the "feature_used" event.
const FEATURE_BY_PATH = {
  "/api/analyze": "ats_analyze",
  "/analyze": "ats_analyze",
  "/api/jobs/search": "job_search",
  "/api/tailor": "tailor",
  "/api/cover-letter": "cover_letter",
  "/api/interview-prep": "interview_prep",
  "/api/skill-gap": "skill_gap",
  "/api/reach-out": "reach_out"
};

const DOWNLOAD_PATHS = new Set(["/api/tailor/download", "/api/cover-letter/download"]);

// The full request path. req.path can't be used: inside a router mounted at
// /api it loses the "/api" prefix, and stays that way when the response finishes.
const fullPath = (req) => (req.originalUrl || req.url).split("?")[0].replace(/\/+$/, "");

export function featureForRequest(req) {
  if (req.method !== "POST") return null;
  const path = fullPath(req);
  if (FEATURE_BY_PATH[path]) return FEATURE_BY_PATH[path];
  if (DOWNLOAD_PATHS.has(path)) {
    const format = req.body?.format;
    return format === "pdf" ? "download_pdf" : format === "docx" ? "download_docx" : null;
  }
  return null;
}

// Records feature_used after a successful response, and an error event for
// server errors and unreadable uploads. Runs on "finish", after the response
// has been sent, so it never delays or changes what the user gets back.
// Only the route and an error type are recorded, never request content.
export function featureTracking(req, res, next) {
  res.on("finish", () => {
    const path = fullPath(req);
    if (!path.startsWith("/api/") && path !== "/analyze") return;
    const context = eventContextFrom(req);

    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Routes can name the feature themselves (tracker_add / tracker_move).
      const feature = res.locals.feature || featureForRequest(req);
      if (feature) {
        const extra = feature === "job_search" && res.locals.jobSearchSource ? { result: res.locals.jobSearchSource } : {};
        trackFeature(context, feature, extra);
      }
    } else if (res.statusCode >= 500 || res.statusCode === 422) {
      trackError(context, path, res.locals.errorType || `http_${res.statusCode}`);
    }
  });
  next();
}
