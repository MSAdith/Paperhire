import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// Fake Supabase: three known tokens. Everything else in the app is real,
// except the AI provider call (no network) and the dashboard's data loaders.
const fake = vi.hoisted(() => ({
  configured: true,
  users: {
    "user-token": { id: "11111111-1111-4111-8111-111111111111", email: "priya@example.com", user_metadata: { full_name: "Priya" }, app_metadata: { provider: "google" } },
    "user2-token": { id: "22222222-2222-4222-8222-222222222222", email: "sam@example.com", user_metadata: {}, app_metadata: { provider: "email" } },
    "admin-token": { id: "33333333-3333-4333-8333-333333333333", email: "Owner@Paperhire.app", user_metadata: {}, app_metadata: { provider: "email" } }
  }
}));

vi.mock("../lib/supabase.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    isSupabaseConfigured: () => fake.configured,
    getSupabaseAdmin: () => ({
      auth: {
        getUser: async (token) => (fake.users[token] ? { data: { user: fake.users[token] }, error: null } : { data: { user: null }, error: new Error("invalid JWT") })
      }
    })
  };
});
vi.mock("../lib/aiProviders.js", () => ({ completeText: vi.fn(async () => '{"not":"valid for any feature"}') }));
vi.mock("../lib/adminData.js", () => ({
  fetchAllEvents: vi.fn(async () => []),
  fetchAllUsers: vi.fn(async () => Object.values(fake.users).map((u) => ({ ...u, created_at: new Date().toISOString() }))),
  fetchLastAuthEvent: vi.fn(async () => null)
}));

const { default: app } = await import("../app.js");
const { PUBLIC_PATHS, clearTokenCache } = await import("../middleware/auth.js");
const { setEventSink, sanitizeEvent } = await import("../lib/events.js");
const { setStores, memoryStores } = await import("../lib/stores.js");

let server;
let base;
const events = [];

beforeAll(async () => {
  process.env.ADMIN_EMAILS = " owner@paperhire.app , ops@paperhire.app";
  process.env.COMETAPI_KEY = "test-key";
  delete process.env.JSEARCH_API_KEY;
  setEventSink(async (e) => events.push(e));
  setStores(memoryStores());
  await new Promise((resolve) => (server = app.listen(0, resolve)));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  setEventSink(null);
  setStores(null);
  server && server.close();
});

beforeEach(() => clearTokenCache());

let ipCounter = 0;
const call = (method, p, { token, body, headers = {} } = {}) =>
  fetch(`${base}${p}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.1.0.${++ipCounter % 250}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

// Every route registered on the real app, read from Express's own route table.
function listRoutes() {
  const routes = [];
  for (const layer of app._router.stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) for (const m of Object.keys(layer.route.methods)) routes.push([m.toUpperCase(), p]);
    } else if (layer.name === "router" && layer.handle.stack) {
      // All routers are mounted at /api in app.js.
      for (const sub of layer.handle.stack) {
        if (!sub.route) continue;
        for (const m of Object.keys(sub.route.methods)) routes.push([m.toUpperCase(), `/api${sub.route.path}`]);
      }
    }
  }
  return routes;
}

const FEATURE_ENDPOINTS = [
  ["POST", "/api/analyze"],
  ["POST", "/analyze"],
  ["POST", "/api/jobs/search"],
  ["POST", "/api/jobs/profile"],
  ["POST", "/api/tailor"],
  ["POST", "/api/tailor/download"],
  ["POST", "/api/cover-letter"],
  ["POST", "/api/cover-letter/download"],
  ["POST", "/api/interview-prep"],
  ["POST", "/api/skill-gap"]
];

describe("Every feature endpoint requires a verified session", () => {
  it("finds all the feature endpoints in the app's route table", () => {
    const registered = listRoutes().map(([m, p]) => `${m} ${p}`);
    for (const [m, p] of FEATURE_ENDPOINTS) expect(registered).toContain(`${m} ${p}`);
  });

  it("rejects every non-public route with 401 when no token is sent", async () => {
    const protectedRoutes = listRoutes().filter(([, p]) => !PUBLIC_PATHS.has(p));
    expect(protectedRoutes.length).toBeGreaterThanOrEqual(FEATURE_ENDPOINTS.length + 3);
    for (const [method, p] of protectedRoutes) {
      const res = await call(method, p, { body: method === "GET" ? undefined : { resumeText: "x", jdText: "y" } });
      expect(res.status, `${method} ${p}`).toBe(401);
    }
  });

  it("rejects invalid or malformed tokens with 401", async () => {
    for (const [method, p] of FEATURE_ENDPOINTS) {
      for (const headers of [{ Authorization: "Bearer not-a-real-token" }, { Authorization: "user-token" }, { Authorization: "Basic dXNlcjpwYXNz" }]) {
        const res = await call(method, p, { headers, body: {} });
        expect(res.status, `${method} ${p} ${headers.Authorization}`).toBe(401);
      }
    }
  });

  it("also protects endpoints that don't exist yet (default deny)", async () => {
    expect((await call("POST", "/api/some-future-feature", { body: {} })).status).toBe(401);
    expect((await call("GET", "/api/admin/anything")).status).toBe(401);
  });

  it("lets a signed-in user through", async () => {
    const res = await call("POST", "/api/jobs/profile", { token: "user-token", body: { resumeText: "Priya Sharma\nBengaluru\nSkills\nReact" } });
    expect(res.status).toBe(200);
  });

  it("returns 503 (never open access) when sign-in isn't configured on the server", async () => {
    fake.configured = false;
    try {
      const res = await call("POST", "/api/tailor", { token: "user-token", body: {} });
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe("auth_not_configured");
    } finally {
      fake.configured = true;
    }
  });

  it("leaves only the intended routes public", async () => {
    expect([...PUBLIC_PATHS].sort()).toEqual(["/api/config", "/api/events/page-view", "/api/health", "/health"]);
    expect((await call("GET", "/api/health")).status).toBe(200);
    expect((await call("GET", "/api/config")).status).toBe(200);
  });
});

describe("Public config never exposes server secrets", () => {
  it("returns only the project URL and the anon key", async () => {
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_ANON_KEY = "public-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret-service-role";
    const res = await call("GET", "/api/config");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ authConfigured: true, supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: "public-anon-key" });
    expect(text).not.toContain("super-secret-service-role");
  });
});

describe("Admin access is decided on the server from ADMIN_EMAILS", () => {
  const ADMIN_ROUTES = ["/api/admin/me", "/api/admin/summary", "/api/admin/summary?range=7d"];

  it("401 without a session, 403 for normal users, 200 for admins (case-insensitive)", async () => {
    for (const p of ADMIN_ROUTES) {
      expect((await call("GET", p)).status, p).toBe(401);
      expect((await call("GET", p, { token: "user-token" })).status, p).toBe(403);
      expect((await call("GET", p, { token: "admin-token" })).status, p).toBe(200);
    }
  });

  it("denies everyone when ADMIN_EMAILS is empty", async () => {
    const saved = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "";
    expect((await call("GET", "/api/admin/me", { token: "admin-token" })).status).toBe(403);
    process.env.ADMIN_EMAILS = saved;
  });

  it("returns dashboard data with users only to admins", async () => {
    const res = await call("GET", "/api/admin/summary?range=7d", { token: "admin-token" });
    const data = await res.json();
    expect(data.range).toBe("7d");
    expect(data.users.map((u) => u.email)).toContain("priya@example.com");
    const denied = await (await call("GET", "/api/admin/summary", { token: "user-token" })).text();
    expect(denied).not.toContain("priya@example.com");
  });
});

describe("Rate limits are per user", () => {
  it("one user hitting the limit doesn't block another user on the same IP", async () => {
    const sameIp = { "X-Forwarded-For": "10.9.9.9" };
    const body = { resumeText: "Priya Sharma\nSkills\nReact" };
    const hit = (token) =>
      fetch(`${base}/api/jobs/profile`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...sameIp }, body: JSON.stringify(body) });
    let lastStatus = 0;
    for (let i = 0; i < 11; i++) lastStatus = (await hit("user-token")).status;
    expect(lastStatus).toBe(429);
    expect((await hit("user2-token")).status).toBe(200);
  });
});

describe("Analytics events never contain resume, JD or AI content", () => {
  const RESUME_MARKER = "Zyxqwv Resume-Marker-7731 Kotlin Blockchain at Quuxcorp";
  const JD_MARKER = "Plimbo JD-Marker-4419 Senior Wizard";
  const resumeText = `Priya Sharma\npriya@example.com | Bengaluru\nSummary\nSoftware Developer. ${RESUME_MARKER}\nProjects\n- Built a React app with JavaScript.\nSkills\nJavaScript, React`;
  const jdText = `Junior Software Developer. ${JD_MARKER}. Requirements: JavaScript, React, Node.js, SQL, Git.`;

  it("records feature, AI and page events with metadata only", async () => {
    events.length = 0;
    // user2: user-token spent its job-search quota in the rate-limit test above.
    const token = "user2-token";
    const headers = { Cookie: "ph_vid=0f8c2d6e-1111-4222-8333-444455556666", "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari", "x-vercel-ip-country": "IN", "x-vercel-ip-city": "Bengaluru" };

    await call("POST", "/api/events/page-view", { headers, body: { path: `/?q=${encodeURIComponent(RESUME_MARKER)}` } });
    await call("POST", "/api/tailor", { token, headers, body: { resumeText, jdText } });
    await call("POST", "/api/cover-letter", { token, headers, body: { resumeText, jdText, tone: "formal", companyName: JD_MARKER, roleTitle: JD_MARKER } });
    await call("POST", "/api/interview-prep", { token, headers, body: { resumeText, jdText } });
    await call("POST", "/api/skill-gap", { token, headers, body: { resumeText, jdText } });
    await call("POST", "/api/jobs/search", { token, headers, body: { resumeText, role: JD_MARKER, location: "Bengaluru" } });
    await call("POST", "/api/tailor/download", {
      token,
      headers,
      body: { format: "pdf", resumeText, tailored: { summary: RESUME_MARKER, sections: [], skills: {}, gapsNotAdded: [] } }
    });
    await call("POST", "/api/cover-letter/download", { token, headers, body: { format: "docx", letter: `Dear team, ${RESUME_MARKER}` } });

    const form = new FormData();
    const docx = fs.readFileSync(path.join(import.meta.dirname, "../../sample-resumes/sample_resume.docx"));
    form.append("resume", new Blob([docx]), "sample_resume.docx");
    form.append("jd", jdText);
    await fetch(`${base}/api/analyze`, { method: "POST", headers: { Authorization: `Bearer ${token}`, ...headers }, body: form });

    await new Promise((r) => setTimeout(r, 100)); // let fire-and-forget events land

    const types = events.map((e) => `${e.type}:${e.name || e.path || ""}`);
    expect(types).toEqual(
      expect.arrayContaining([
        "page_view:/",
        "feature_used:tailor",
        "feature_used:cover_letter",
        "feature_used:interview_prep",
        "feature_used:skill_gap",
        "feature_used:job_search",
        "feature_used:download_pdf",
        "feature_used:download_docx",
        "feature_used:ats_analyze",
        "ai_call:tailor"
      ])
    );

    const allowed = new Set(["type", "name", "path", "result", "duration_ms", "route", "error_type", "user_id", "visitor_id", "device", "browser", "country", "city"]);
    for (const e of events) for (const k of Object.keys(e)) expect(allowed.has(k), `unexpected field ${k}`).toBe(true);

    const dump = JSON.stringify(events);
    for (const secret of ["Resume-Marker-7731", "Quuxcorp", "JD-Marker-4419", "Plimbo", "Alex Mercer", "alex.mercer@example.com", "priya@example.com", "Dear team"]) {
      expect(dump, secret).not.toContain(secret);
    }
    const tailorEvent = events.find((e) => e.type === "feature_used" && e.name === "tailor");
    expect(tailorEvent).toMatchObject({ device: "mobile", browser: "Safari", country: "IN", city: "Bengaluru", visitor_id: "0f8c2d6e-1111-4222-8333-444455556666" });
  });

  it("drops unknown fields and free text even if a caller tries to smuggle it in", () => {
    const e = sanitizeEvent({
      type: "feature_used",
      name: "tailor",
      resumeText: "my whole resume",
      jdText: "a job description",
      output: "AI text",
      route: "Experienced engineer who built things, with commas",
      path: "/admin?email=me@x.com",
      user_id: "not-a-uuid with spaces",
      country: "India"
    });
    expect(e).toEqual({ type: "feature_used", name: "tailor", path: "/admin" });
    expect(sanitizeEvent({ type: "feature_used", name: "my resume text" })).toBeNull();
    expect(sanitizeEvent({ type: "resume_upload" })).toBeNull();
  });
});
