import { FEATURES } from "./events.js";

// Pure aggregation for the admin dashboard: (events, users, options) -> numbers.
// Kept free of I/O so it can be unit-tested with plain arrays.

const DAY_MS = 24 * 60 * 60 * 1000;
export const JSEARCH_MONTHLY_QUOTA = 200;
export const RANGES = { "7d": 7, "30d": 30, all: null };

const ts = (v) => (v ? new Date(v).getTime() : NaN);
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const startOfUtcDay = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const visitorKey = (e) => e.visitor_id || (e.user_id ? `user:${e.user_id}` : null);

function uniqueCount(events, keyFn) {
  const set = new Set();
  for (const e of events) {
    const k = keyFn(e);
    if (k) set.add(k);
  }
  return set.size;
}

// Unique visitors per value of `field` (e.g. country), largest first.
function topByUniqueVisitors(events, field, limit = 8) {
  const groups = new Map();
  for (const e of events) {
    const value = e[field];
    const v = visitorKey(e);
    if (!value || !v) continue;
    if (!groups.has(value)) groups.set(value, new Set());
    groups.get(value).add(v);
  }
  return [...groups.entries()]
    .map(([label, set]) => ({ label, count: set.size }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function userDisplayName(u) {
  const meta = u.user_metadata || {};
  return meta.full_name || meta.name || "";
}

function userMethod(u) {
  const providers = u.app_metadata?.providers || (u.app_metadata?.provider ? [u.app_metadata.provider] : []);
  if (providers.length === 0) return "email";
  return providers.map((p) => (p === "email" ? "magic link" : p === "google" ? "Google" : p)).join(", ");
}

const FEEDBACK_FEATURES = ["tailor", "cover_letter", "interview_prep", "skill_gap", "reach_out"];
const FEEDBACK_REASONS = ["made_things_up", "too_generic", "wrong_tone", "bad_formatting", "other"];

// feedback: rows from the ai_feedback table (never contains AI output).
export function computeDashboard(events, users, { range = "30d", now = Date.now(), feedback = [] } = {}) {
  const days = RANGES[range] === undefined ? 30 : RANGES[range];
  const rangeStart = days ? now - days * DAY_MS : -Infinity;
  const inRange = events.filter((e) => ts(e.created_at) >= rangeStart && ts(e.created_at) <= now);
  const pageViews = inRange.filter((e) => e.type === "page_view");
  const allPageViews = events.filter((e) => e.type === "page_view");
  const since = (ms) => allPageViews.filter((e) => ts(e.created_at) >= ms);
  const activeSince = (ms) => uniqueCount(events.filter((e) => ts(e.created_at) >= ms), (e) => e.user_id);

  const stats = {
    totalVisitors: uniqueCount(pageViews, visitorKey),
    uniqueToday: uniqueCount(since(startOfUtcDay(now)), visitorKey),
    unique7d: uniqueCount(since(now - 7 * DAY_MS), visitorKey),
    unique30d: uniqueCount(since(now - 30 * DAY_MS), visitorKey),
    totalUsers: users.length,
    newSignups7d: users.filter((u) => ts(u.created_at) >= now - 7 * DAY_MS).length,
    dau: activeSince(now - DAY_MS),
    wau: activeSince(now - 7 * DAY_MS)
  };

  // Daily series: the selected range, capped at 30 days so the chart stays readable.
  const seriesDays = Math.min(days || 30, 30);
  const firstDay = startOfUtcDay(now) - (seriesDays - 1) * DAY_MS;
  const daily = [];
  for (let i = 0; i < seriesDays; i++) {
    const start = firstDay + i * DAY_MS;
    const end = start + DAY_MS;
    daily.push({
      date: dayKey(start),
      visitors: uniqueCount(allPageViews.filter((e) => ts(e.created_at) >= start && ts(e.created_at) < end), visitorKey),
      signups: users.filter((u) => ts(u.created_at) >= start && ts(u.created_at) < end).length,
      aiCalls: events.filter((e) => e.type === "ai_call" && ts(e.created_at) >= start && ts(e.created_at) < end).length
    });
  }

  const featureUsage = FEATURES.map((name) => ({
    name,
    count: inRange.filter((e) => e.type === "feature_used" && e.name === name).length
  }));

  const aiCalls = inRange.filter((e) => e.type === "ai_call");
  const aiSuccess = aiCalls.filter((e) => e.result === "success");
  const durations = aiCalls.map((e) => e.duration_ms).filter((d) => Number.isFinite(d));
  const ai = {
    calls: aiCalls.length,
    successRate: aiCalls.length ? Math.round((aiSuccess.length / aiCalls.length) * 1000) / 10 : null,
    avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    failures: {
      failed: aiCalls.filter((e) => e.result === "failed").length,
      rate_limited: aiCalls.filter((e) => e.result === "rate_limited").length,
      out_of_credits: aiCalls.filter((e) => e.result === "out_of_credits").length
    }
  };

  const nowDate = new Date(now);
  const monthStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1);
  const jsearch = {
    usedThisMonth: events.filter(
      (e) => e.type === "feature_used" && e.name === "job_search" && e.result !== "cached" && ts(e.created_at) >= monthStart
    ).length,
    quota: JSEARCH_MONTHLY_QUOTA
  };

  const errorCounts = new Map();
  for (const e of inRange.filter((x) => x.type === "error")) {
    const key = `${e.route || "?"}|${e.error_type || "unknown"}`;
    errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
  }
  const errors = [...errorCounts.entries()]
    .map(([key, count]) => {
      const [route, type] = key.split("|");
      return { route, type, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Users table: all-time activity per user.
  const lastSeen = new Map();
  const analyses = new Map();
  for (const e of events) {
    if (!e.user_id) continue;
    const t = ts(e.created_at);
    if (!lastSeen.has(e.user_id) || t > lastSeen.get(e.user_id)) lastSeen.set(e.user_id, t);
    if (e.type === "feature_used" && e.name === "ats_analyze") analyses.set(e.user_id, (analyses.get(e.user_id) || 0) + 1);
  }
  const userRows = users.map((u) => {
    const seen = lastSeen.get(u.id) || ts(u.last_sign_in_at);
    return {
      id: u.id,
      name: userDisplayName(u),
      email: u.email || "",
      signedUpAt: u.created_at || null,
      lastSeenAt: Number.isFinite(seen) ? new Date(seen).toISOString() : null,
      analyses: analyses.get(u.id) || 0,
      method: userMethod(u)
    };
  });

  const userById = new Map(users.map((u) => [u.id, u]));
  const aiByUser = new Map();
  for (const e of aiCalls) {
    if (e.user_id) aiByUser.set(e.user_id, (aiByUser.get(e.user_id) || 0) + 1);
  }
  const topAiUsers = [...aiByUser.entries()]
    .map(([id, count]) => ({ id, count, email: userById.get(id)?.email || "(deleted user)", name: userById.get(id) ? userDisplayName(userById.get(id)) : "" }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const fbInRange = feedback.filter((f) => ts(f.created_at) >= rangeStart && ts(f.created_at) <= now);
  const feedbackSummary = {
    total: fbInRange.length,
    byFeature: FEEDBACK_FEATURES.map((feature) => {
      const rows = fbInRange.filter((f) => f.feature === feature);
      const up = rows.filter((f) => f.rating === "up").length;
      return { feature, up, down: rows.length - up, upRate: rows.length ? Math.round((up / rows.length) * 100) : null };
    }),
    reasons: FEEDBACK_REASONS.map((reason) => ({
      reason,
      count: fbInRange.filter((f) => f.rating === "down" && f.reason === reason).length
    })).sort((a, b) => b.count - a.count),
    comments: fbInRange
      .filter((f) => f.comment)
      .sort((a, b) => ts(b.created_at) - ts(a.created_at))
      .slice(0, 200)
      .map((f) => ({
        createdAt: f.created_at,
        feature: f.feature,
        rating: f.rating,
        reason: f.reason || null,
        comment: f.comment,
        model: f.model || null,
        email: userById.get(f.user_id)?.email || ""
      }))
  };

  return {
    range,
    generatedAt: new Date(now).toISOString(),
    stats,
    daily,
    featureUsage,
    ai,
    jsearch,
    geo: {
      countries: topByUniqueVisitors(pageViews, "country"),
      cities: topByUniqueVisitors(pageViews, "city")
    },
    devices: topByUniqueVisitors(pageViews, "device"),
    browsers: topByUniqueVisitors(pageViews, "browser"),
    errors,
    topAiUsers,
    feedback: feedbackSummary,
    users: userRows
  };
}
