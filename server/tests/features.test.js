import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Real app + auth gate, fake Supabase sessions, in-memory tables, fake AI.
const fake = vi.hoisted(() => ({
  users: {
    "alice-token": { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "alice@example.com", user_metadata: {}, app_metadata: { provider: "google" } },
    "bob-token": { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "bob@example.com", user_metadata: {}, app_metadata: { provider: "email" } },
    "carol-token": { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "carol@example.com", user_metadata: {}, app_metadata: { provider: "email" } },
    "admin-token": { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", email: "owner@paperhire.app", user_metadata: {}, app_metadata: { provider: "email" } }
  },
  aiReply: '{"message":"Hi there, short note."}'
}));

vi.mock("../lib/supabase.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    isSupabaseConfigured: () => true,
    getSupabaseAdmin: () => ({
      auth: {
        getUser: async (token) => (fake.users[token] ? { data: { user: fake.users[token] }, error: null } : { data: { user: null }, error: new Error("bad") })
      }
    })
  };
});
vi.mock("../lib/aiProviders.js", () => ({ completeText: vi.fn(async () => fake.aiReply) }));

const { default: app } = await import("../app.js");
const { setStores, memoryStores } = await import("../lib/stores.js");
const { setEventSink } = await import("../lib/events.js");
const { clearTokenCache } = await import("../middleware/auth.js");
const { fitToLimit, LINKEDIN_NOTE_LIMIT } = await import("../prompts/reachOut.js");

let server;
let base;
let stores;
const events = [];

beforeAll(async () => {
  process.env.ADMIN_EMAILS = "owner@paperhire.app";
  process.env.COMETAPI_KEY = "test-key";
  setEventSink(async (e) => events.push(e));
  await new Promise((resolve) => (server = app.listen(0, resolve)));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  setStores(null);
  setEventSink(null);
  server && server.close();
});

beforeEach(() => {
  stores = memoryStores();
  setStores(stores);
  clearTokenCache();
  events.length = 0;
  fake.aiReply = '{"message":"Hi there, short note."}';
});

let ip = 0;
const call = (method, path, { token, body } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.2.${Math.floor(++ip / 250)}.${ip % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
const json = async (res) => (res.status === 204 ? null : res.json());

const RESUME = "Priya Sharma\npriya@example.com | Bengaluru\nSummary\nSoftware Developer.\nProjects\n- Built a React app with JavaScript used by 120 classmates.\nSkills\nJavaScript, React";
const JD = "Junior Software Developer at Acme. Requirements: JavaScript, React, Node.js, SQL and Git.";
const reachOut = (token, extra = {}) =>
  call("POST", "/api/reach-out", { token, body: { resumeText: RESUME, jdText: JD, companyName: "Acme", messageType: "linkedin_referral", ...extra } });

describe("Tracker: users only ever see and change their own applications", () => {
  it("requires a session for every tracker endpoint", async () => {
    expect((await call("GET", "/api/tracker")).status).toBe(401);
    expect((await call("POST", "/api/tracker", { body: { title: "x", company: "y" } })).status).toBe(401);
    expect((await call("PATCH", "/api/tracker/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { body: { status: "applied" } })).status).toBe(401);
    expect((await call("DELETE", "/api/tracker/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).status).toBe(401);
  });

  it("isolates lists, updates and deletes between users", async () => {
    const created = await json(await call("POST", "/api/tracker", { token: "alice-token", body: { title: "Frontend Developer", company: "Acme", jobUrl: "https://acme.example/jobs/1" } }));
    const aliceId = created.application.id;
    expect(created.application.status).toBe("saved");

    // Bob sees nothing of Alice's
    expect((await json(await call("GET", "/api/tracker", { token: "bob-token" }))).applications).toEqual([]);
    // ...and can't move, edit or delete it: 404, as if it didn't exist
    expect((await call("PATCH", `/api/tracker/${aliceId}`, { token: "bob-token", body: { status: "offer" } })).status).toBe(404);
    expect((await call("PATCH", `/api/tracker/${aliceId}`, { token: "bob-token", body: { note: "hijacked" } })).status).toBe(404);
    expect((await call("DELETE", `/api/tracker/${aliceId}`, { token: "bob-token" })).status).toBe(404);

    // Alice's card is untouched
    const aliceList = (await json(await call("GET", "/api/tracker", { token: "alice-token" }))).applications;
    expect(aliceList).toHaveLength(1);
    expect(aliceList[0]).toMatchObject({ id: aliceId, status: "saved", note: "" });

    // Alice can move and delete her own card
    expect((await json(await call("PATCH", `/api/tracker/${aliceId}`, { token: "alice-token", body: { status: "applied" } }))).application.status).toBe("applied");
    expect((await call("DELETE", `/api/tracker/${aliceId}`, { token: "alice-token" })).status).toBe(204);
  });

  it("ignores a user id in the request body", async () => {
    const res = await call("POST", "/api/tracker", {
      token: "bob-token",
      body: { title: "Data Analyst", company: "Beta", user_id: fake.users["alice-token"].id, userId: fake.users["alice-token"].id }
    });
    expect(res.status).toBe(201);
    expect(await stores.tracker.list(fake.users["alice-token"].id)).toEqual([]);
    expect(await stores.tracker.list(fake.users["bob-token"].id)).toHaveLength(1);
  });

  it("validates fields and dedupes 'Track this job' on the same listing", async () => {
    const bad = await call("POST", "/api/tracker", { token: "alice-token", body: { title: "X", company: "Y", jobUrl: "javascript:alert(1)" } });
    expect(bad.status).toBe(400);
    const longNote = await call("POST", "/api/tracker", { token: "alice-token", body: { title: "X", company: "Y", note: "n".repeat(501) } });
    expect(longNote.status).toBe(400);
    const badStatus = await call("POST", "/api/tracker", { token: "alice-token", body: { title: "X", company: "Y", status: "hired" } });
    expect(badStatus.status).toBe(400);

    const first = await json(await call("POST", "/api/tracker", { token: "alice-token", body: { title: "SDE", company: "Gamma", externalId: "job-123" } }));
    const again = await json(await call("POST", "/api/tracker", { token: "alice-token", body: { title: "SDE", company: "Gamma", externalId: "job-123" } }));
    expect(again.duplicate).toBe(true);
    expect(again.application.id).toBe(first.application.id);
    // The same listing is a separate card for another user
    const bobs = await call("POST", "/api/tracker", { token: "bob-token", body: { title: "SDE", company: "Gamma", externalId: "job-123" } });
    expect(bobs.status).toBe(201);
  });

  it("records tracker_add and tracker_move (only when the status really changes)", async () => {
    const { application } = await json(await call("POST", "/api/tracker", { token: "alice-token", body: { title: "SDE", company: "Delta" } }));
    await call("PATCH", `/api/tracker/${application.id}`, { token: "alice-token", body: { note: "Called the recruiter" } });
    await call("PATCH", `/api/tracker/${application.id}`, { token: "alice-token", body: { status: "interview" } });
    await new Promise((r) => setTimeout(r, 50));
    const names = events.filter((e) => e.type === "feature_used").map((e) => e.name);
    expect(names.filter((n) => n === "tracker_add")).toHaveLength(1);
    expect(names.filter((n) => n === "tracker_move")).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("Called the recruiter");
  });
});

describe("Feedback never stores AI output or resume text", () => {
  it("keeps only the allowed fields and caps the comment", async () => {
    const res = await call("POST", "/api/feedback", {
      token: "alice-token",
      body: {
        feature: "cover_letter",
        rating: "down",
        reason: "too_generic",
        comment: `${"Too long. ".repeat(60)}`,
        responseMs: 12345,
        output: "Dear Hiring Manager, I am thrilled to apply...",
        letter: "the whole AI letter",
        resumeText: RESUME,
        jdText: JD
      }
    });
    expect(res.status).toBe(201);
    const [row] = await stores.feedback.all();
    expect(Object.keys(row).sort()).toEqual(["comment", "created_at", "feature", "id", "model", "provider", "rating", "reason", "response_ms", "user_id"]);
    expect(row).toMatchObject({ feature: "cover_letter", rating: "down", reason: "too_generic", response_ms: 12345, provider: "cometapi", user_id: fake.users["alice-token"].id });
    expect(row.comment.length).toBeLessThanOrEqual(300);
    const dump = JSON.stringify(row);
    for (const secret of ["Dear Hiring Manager", "the whole AI letter", "Priya Sharma", "Acme"]) expect(dump).not.toContain(secret);
  });

  it("drops reason and comment on a thumbs up, and rejects unknown values", async () => {
    await call("POST", "/api/feedback", { token: "alice-token", body: { feature: "tailor", rating: "up", reason: "other", comment: "great" } });
    const [row] = await stores.feedback.all();
    expect(row).toMatchObject({ rating: "up", reason: null, comment: null });
    expect((await call("POST", "/api/feedback", { token: "alice-token", body: { feature: "ats_analyze", rating: "up" } })).status).toBe(400);
    expect((await call("POST", "/api/feedback", { token: "alice-token", body: { feature: "tailor", rating: "meh" } })).status).toBe(400);
    expect((await call("POST", "/api/feedback", { token: "alice-token", body: { feature: "tailor", rating: "down", reason: "rude" } })).status).toBe(400);
    expect((await call("POST", "/api/feedback", { body: { feature: "tailor", rating: "up" } })).status).toBe(401);
  });
});

describe("No daily AI cap (only per-minute rate limits)", () => {
  it("ignores an old AI_DAILY_LIMIT_PER_USER setting and keeps serving AI requests", async () => {
    process.env.AI_DAILY_LIMIT_PER_USER = "0";
    try {
      for (let i = 0; i < 5; i++) expect((await reachOut("carol-token")).status).toBe(200);
      expect((await call("POST", "/api/interview-prep", { token: "carol-token", body: { resumeText: RESUME, jdText: JD } })).status).toBe(200);
      const gap = await json(await call("POST", "/api/skill-gap", { token: "carol-token", body: { resumeText: RESUME, jdText: JD } }));
      expect(gap.planError || "").not.toMatch(/AI credits/);
    } finally {
      delete process.env.AI_DAILY_LIMIT_PER_USER;
    }
  });

  it("no longer has an AI-usage endpoint", async () => {
    expect((await call("GET", "/api/ai-usage", { token: "carol-token" })).status).toBe(404);
  });

  it("still blocks rapid-fire requests with the per-minute rate limit", async () => {
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await reachOut("bob-token")).status;
    expect(last).toBe(429);
    const body = await (await reachOut("bob-token")).json();
    expect(body.error).toMatch(/Too many outreach requests/);
    expect(body.code).toBeUndefined();
  });

  it("still records each AI call with the user, for the admin dashboard", async () => {
    events.length = 0;
    await reachOut("alice-token");
    await new Promise((r) => setTimeout(r, 50));
    const aiCall = events.find((e) => e.type === "ai_call" && e.name === "reach_out");
    expect(aiCall).toMatchObject({ user_id: fake.users["alice-token"].id, result: "success" });
    expect(Number.isFinite(aiCall.duration_ms)).toBe(true);
  });
});

describe("Reach Out: LinkedIn notes fit the 300-character limit", () => {
  it("trims an overlong AI reply at a sentence or word boundary, never mid-word", async () => {
    const long = `Hi Asha, I'm Priya, a developer who built a React app used by 120 classmates. ${"I would love to learn more about the frontend team and how you work. ".repeat(6)}`;
    fake.aiReply = JSON.stringify({ message: long });
    const data = await json(await reachOut("alice-token"));
    expect(data.charLimit).toBe(300);
    expect(data.message.length).toBeLessThanOrEqual(LINKEDIN_NOTE_LIMIT);
    expect(data.charCount).toBe(data.message.length);
    expect(data.subject).toBeNull();
    expect(data.message).toMatch(/[.!?…]$/);
  });

  it("fitToLimit handles text with no sentence breaks", () => {
    const words = "referral ".repeat(80).trim();
    const fitted = fitToLimit(words);
    expect(fitted.length).toBeLessThanOrEqual(300);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted.slice(0, -1).split(" ").every((w) => w === "referral")).toBe(true);
    expect(fitToLimit("Short and sweet.")).toBe("Short and sweet.");
  });

  it("returns a subject for emails and no length cap", async () => {
    fake.aiReply = JSON.stringify({ subject: "Junior Software Developer role", message: `Hello,\n\n${"I'd love to be considered. ".repeat(20)}` });
    const data = await json(await reachOut("alice-token", { messageType: "cold_email", tone: "formal" }));
    expect(data.subject).toBe("Junior Software Developer role");
    expect(data.charLimit).toBeNull();
    expect(data.message.length).toBeGreaterThan(300);
  });

  it("validates inputs and records feature_used: reach_out", async () => {
    expect((await reachOut("alice-token", { messageType: "sms" })).status).toBe(400);
    expect((await reachOut("alice-token", { companyName: "" })).status).toBe(400);
    expect((await reachOut("alice-token", { tone: "spicy" })).status).toBe(400);
    events.length = 0;
    await reachOut("alice-token");
    await new Promise((r) => setTimeout(r, 50));
    expect(events.some((e) => e.type === "feature_used" && e.name === "reach_out")).toBe(true);
    expect(events.some((e) => e.type === "ai_call" && e.name === "reach_out")).toBe(true);
  });

  it("puts the no-fabrication and fresher rules in the prompt", async () => {
    const { completeText } = await import("../lib/aiProviders.js");
    completeText.mockClear();
    await reachOut("alice-token");
    const prompt = completeText.mock.calls[0][1].prompt;
    expect(prompt).toMatch(/STRICT RULE: Never invent jobs/);
    expect(prompt).toMatch(/NO formal work experience/);
    expect(prompt).toMatch(/at most 280 characters/);
  });
});
