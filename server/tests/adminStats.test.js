import { describe, it, expect } from "vitest";
import { computeDashboard } from "../lib/adminStats.js";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const at = (daysAgo, hour = 10) => new Date(NOW - daysAgo * 86400000 - (12 - hour) * 3600000).toISOString();
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const events = [
  { type: "page_view", path: "/", visitor_id: "visitor-aaaaaaaa", created_at: at(0), country: "IN", city: "Bengaluru", device: "mobile", browser: "Chrome" },
  { type: "page_view", path: "/", visitor_id: "visitor-aaaaaaaa", created_at: at(0, 11), country: "IN", city: "Bengaluru", device: "mobile", browser: "Chrome" },
  { type: "page_view", path: "/", visitor_id: "visitor-bbbbbbbb", created_at: at(3), country: "IN", city: "Pune", device: "desktop", browser: "Firefox" },
  { type: "page_view", path: "/", visitor_id: "visitor-cccccccc", created_at: at(20), country: "US", city: "Austin", device: "desktop", browser: "Chrome" },
  { type: "page_view", path: "/", visitor_id: "visitor-dddddddd", created_at: at(60), country: "GB", device: "desktop", browser: "Safari" },
  { type: "feature_used", name: "ats_analyze", user_id: U1, created_at: at(0) },
  { type: "feature_used", name: "ats_analyze", user_id: U1, created_at: at(40) },
  { type: "feature_used", name: "tailor", user_id: U2, created_at: at(5) },
  { type: "feature_used", name: "job_search", result: "live", user_id: U2, created_at: at(1) },
  { type: "feature_used", name: "job_search", result: "cached", user_id: U2, created_at: at(1) },
  { type: "ai_call", name: "tailor", result: "success", duration_ms: 1000, created_at: at(1) },
  { type: "ai_call", name: "tailor", result: "success", duration_ms: 3000, created_at: at(2) },
  { type: "ai_call", name: "cover_letter", result: "rate_limited", duration_ms: 500, created_at: at(2) },
  { type: "ai_call", name: "tailor", result: "out_of_credits", duration_ms: 300, created_at: at(2) },
  { type: "error", route: "/api/analyze", error_type: "pdf_parse_failed", created_at: at(1) }
];

const users = [
  { id: U1, email: "priya@example.com", created_at: at(2), user_metadata: { full_name: "Priya" }, app_metadata: { provider: "google", providers: ["google"] } },
  { id: U2, email: "sam@example.com", created_at: at(45), last_sign_in_at: at(9), user_metadata: {}, app_metadata: { provider: "email" } }
];

describe("Admin dashboard aggregation", () => {
  const d7 = computeDashboard(events, users, { range: "7d", now: NOW });
  const all = computeDashboard(events, users, { range: "all", now: NOW });

  it("counts unique visitors, not page views, for each window", () => {
    expect(d7.stats.totalVisitors).toBe(2);
    expect(all.stats.totalVisitors).toBe(4);
    expect(d7.stats.uniqueToday).toBe(1);
    expect(d7.stats.unique7d).toBe(2);
    expect(d7.stats.unique30d).toBe(3);
  });

  it("counts users, recent sign-ups and active users", () => {
    expect(d7.stats.totalUsers).toBe(2);
    expect(d7.stats.newSignups7d).toBe(1);
    expect(d7.stats.dau).toBe(1);
    expect(d7.stats.wau).toBe(2);
  });

  it("builds one point per day for the chart", () => {
    expect(d7.daily).toHaveLength(7);
    expect(all.daily).toHaveLength(30);
    expect(d7.daily.at(-1)).toEqual({ date: "2026-11-10", visitors: 1, signups: 0, aiCalls: 0 });
    expect(d7.daily.find((p) => p.date === "2026-11-08").aiCalls).toBe(3);
    expect(d7.daily.find((p) => p.date === "2026-11-08").signups).toBe(1);
  });

  it("summarises feature usage, AI health and the JSearch quota", () => {
    expect(d7.featureUsage.find((f) => f.name === "tailor").count).toBe(1);
    expect(all.featureUsage.find((f) => f.name === "ats_analyze").count).toBe(2);
    expect(d7.ai).toEqual({ calls: 4, successRate: 50, avgDurationMs: 1200, failures: { failed: 0, rate_limited: 1, out_of_credits: 1 } });
    expect(d7.jsearch).toEqual({ usedThisMonth: 1, quota: 200 });
  });

  it("ranks countries, cities, devices and browsers by unique visitors", () => {
    expect(d7.geo.countries).toEqual([{ label: "IN", count: 2 }]);
    expect(all.devices).toEqual([{ label: "desktop", count: 3 }, { label: "mobile", count: 1 }]);
    expect(all.browsers[0]).toEqual({ label: "Chrome", count: 2 });
  });

  it("lists users with sign-in method, analyses and last seen", () => {
    const priya = d7.users.find((u) => u.email === "priya@example.com");
    expect(priya).toMatchObject({ name: "Priya", analyses: 2, method: "Google" });
    expect(priya.lastSeenAt).toBe(at(0));
    const sam = d7.users.find((u) => u.email === "sam@example.com");
    expect(sam).toMatchObject({ analyses: 0, method: "magic link" });
    expect(sam.lastSeenAt).toBe(at(1));
  });
});
