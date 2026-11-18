import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";

// Only the AI provider call is mocked; routers, scoring, guardrails, and docgen are real.
const aiMock = vi.hoisted(() => ({ generateJSON: vi.fn(), isAIConfigured: vi.fn(() => true) }));
vi.mock("../lib/aiClient.js", () => aiMock);

const { default: tailorRouter } = await import("../routes/tailor.js");
const { default: coverLetterRouter } = await import("../routes/coverLetter.js");
const { default: interviewPrepRouter } = await import("../routes/interviewPrep.js");
const { default: skillGapRouter } = await import("../routes/skillGap.js");
const { default: jobsRouter } = await import("../routes/jobs.js");

const RESUME = `Priya Sharma
priya@example.com | +91 98765 43210 | Location: Bengaluru
Education
B.Tech Computer Science | 2021 – 2025
Projects
- Built a React to-do app with JavaScript and Firebase used by 120 classmates.
Skills
Languages: JavaScript, HTML, CSS
Frameworks: React`;

const JD = `Junior Software Developer - Bengaluru
- Strong knowledge of React and JavaScript.
- Build REST APIs with Node.js.
- Working knowledge of SQL.
Nice to have: Docker.`;

let server;
let base;

beforeAll(async () => {
  const app = express();
  // Lets a test pick its client IP via X-Forwarded-For, so per-IP rate limits
  // (8/min on /tailor) don't leak between tests.
  app.set("trust proxy", true);
  app.use(express.json({ limit: "1mb" }));
  for (const r of [tailorRouter, coverLetterRouter, interviewPrepRouter, skillGapRouter, jobsRouter]) {
    app.use("/api", r);
  }
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

afterAll(() => server && server.close());

beforeEach(() => {
  aiMock.generateJSON.mockReset();
  aiMock.isAIConfigured.mockReturnValue(true);
});

const post = (path, body) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/tailor", () => {
  it("strips hallucinated skills and returns before/after scores", async () => {
    aiMock.generateJSON.mockResolvedValue({
      ok: true,
      data: {
        summary: "Computer Science student skilled in React and JavaScript.",
        sections: [{ heading: "Projects", items: ["Built a React and JavaScript to-do app used by 120 classmates."] }],
        skills: { Languages: ["JavaScript", "TypeScript"], Frameworks: ["React", "Node.js"] },
        gapsNotAdded: ["SQL"]
      }
    });

    const res = await post("/tailor", { resumeText: RESUME, jdText: JD });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.configured).toBe(true);
    expect(data.tailored.skills.Languages).toEqual(["JavaScript"]);
    expect(data.tailored.skills.Frameworks).toEqual(["React"]);
    expect(data.tailored.gapsNotAdded).toEqual(expect.arrayContaining(["SQL", "TypeScript", "Node.js"]));
    expect(typeof data.before.atsScore).toBe("number");
    expect(typeof data.after.atsScore).toBe("number");
    expect(typeof data.after.jdMatchPercent).toBe("number");
  });

  it("returns a friendly not-configured message but still computes 'before' metrics", async () => {
    aiMock.generateJSON.mockResolvedValue({ ok: false, reason: "not_configured" });
    const data = await (await post("/tailor", { resumeText: RESUME, jdText: JD })).json();
    expect(data.configured).toBe(false);
    expect(data.error).toMatch(/COMETAPI_KEY/);
    expect(typeof data.before.atsScore).toBe("number");
  });

  it("shows a friendly 'busy' message on a rate limit and a 'credits' message when credits run out", async () => {
    aiMock.generateJSON.mockResolvedValue({ ok: false, reason: "rate_limited" });
    const busy = await (await post("/tailor", { resumeText: RESUME, jdText: JD })).json();
    expect(busy.configured).toBe(true);
    expect(busy.error).toBe("AI is busy, try again in a minute.");

    aiMock.generateJSON.mockResolvedValue({ ok: false, reason: "no_credits" });
    const broke = await (await post("/cover-letter", { resumeText: RESUME, jdText: JD, tone: "formal" })).json();
    expect(broke.error).toMatch(/AI credits used up/);
  });

  it("tells fresher resumes' prompt not to claim experience", async () => {
    aiMock.generateJSON.mockResolvedValue({ ok: false, reason: "ai_error" });
    await post("/tailor", { resumeText: RESUME, jdText: JD });
    expect(aiMock.generateJSON.mock.calls[0][0].prompt).toMatch(/NO formal work experience/);
  });

  it("rejects a missing job description", async () => {
    const res = await post("/tailor", { resumeText: RESUME, jdText: "" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/tailor score backstop", () => {
  let n = 0;
  const postFresh = (path, body) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.0.${++n}` },
      body: JSON.stringify(body)
    });
  // Faithful to RESUME: same sections, headers verbatim, bullets rephrased.
  const GOOD = {
    ok: true,
    data: {
      summary: "Computer Science student who built a React and JavaScript to-do app used by 120 classmates.",
      sections: [
        { heading: "Education", entries: [{ header: "B.Tech Computer Science | 2021 – 2025", bullets: [] }] },
        { heading: "Projects", entries: [{ header: "", bullets: ["Built a React to-do app with JavaScript and Firebase used by 120 classmates."] }] }
      ],
      skills: { Languages: ["JavaScript", "HTML", "CSS"], Frameworks: ["React"] },
      gapsNotAdded: ["Node.js", "SQL"]
    }
  };
  // Drops sections, bullets and skills: scores lower than the original.
  const BAD = {
    ok: true,
    data: {
      summary: "Student.",
      sections: [{ heading: "Projects", entries: [{ header: "", bullets: ["Worked on an app."] }] }],
      skills: {},
      gapsNotAdded: []
    }
  };

  it("returns the first attempt without retrying when it doesn't score lower", async () => {
    aiMock.generateJSON.mockResolvedValueOnce(GOOD);
    const data = await (await postFresh("/tailor", { resumeText: RESUME, jdText: JD })).json();
    expect(aiMock.generateJSON).toHaveBeenCalledTimes(1);
    expect(data.attempts).toBe(1);
    expect(data.keptOriginal).toBeUndefined();
    expect(data.after.atsScore).toBeGreaterThanOrEqual(data.before.atsScore);
    expect(data.tailored.contactLines[0]).toBe("Priya Sharma");
  });

  it("retries once with score feedback and returns the retry when it no longer scores lower", async () => {
    aiMock.generateJSON.mockResolvedValueOnce(BAD).mockResolvedValueOnce(GOOD);
    const data = await (await postFresh("/tailor", { resumeText: RESUME, jdText: JD })).json();
    expect(aiMock.generateJSON).toHaveBeenCalledTimes(2);
    const retryPrompt = aiMock.generateJSON.mock.calls[1][0].prompt;
    expect(retryPrompt).toMatch(/PREVIOUS ATTEMPT SCORED LOWER THAN THE ORIGINAL RESUME/);
    expect(retryPrompt).toMatch(/dropped from/);
    expect(aiMock.generateJSON.mock.calls[1][0].timeoutMs).toBeLessThanOrEqual(55000);
    expect(data.attempts).toBe(2);
    expect(data.tailored).not.toBeNull();
    expect(data.after.atsScore).toBeGreaterThanOrEqual(data.before.atsScore);
  });

  it("keeps the original with a note when both attempts score lower", async () => {
    aiMock.generateJSON.mockResolvedValue(BAD);
    const data = await (await postFresh("/tailor", { resumeText: RESUME, jdText: JD })).json();
    expect(aiMock.generateJSON).toHaveBeenCalledTimes(2);
    expect(data.keptOriginal).toBe(true);
    expect(data.tailored).toBeNull();
    expect(data.after).toEqual(data.before);
    expect(data.bestAttempt.atsScore).toBeLessThan(data.before.atsScore);
    expect(data.note).toMatch(new RegExp(`scored ${data.bestAttempt.atsScore}/100, lower than your original's ${data.before.atsScore}/100`));
  });

  it("keeps the original when the retry itself fails", async () => {
    aiMock.generateJSON.mockResolvedValueOnce(BAD).mockResolvedValueOnce({ ok: false, reason: "timeout" });
    const data = await (await postFresh("/tailor", { resumeText: RESUME, jdText: JD })).json();
    expect(data.keptOriginal).toBe(true);
    expect(data.tailored).toBeNull();
  });
});

describe("POST /api/cover-letter", () => {
  it("returns the letter with a word count", async () => {
    const letter = `Dear Hiring Manager,\n\n${"I would love to contribute to your team. ".repeat(35)}\n\nSincerely,\nPriya Sharma`;
    aiMock.generateJSON.mockResolvedValue({ ok: true, data: { letter } });
    const data = await (await post("/cover-letter", { resumeText: RESUME, jdText: JD, tone: "concise", companyName: "Acme" })).json();
    expect(data.configured).toBe(true);
    expect(data.wordCount).toBeGreaterThan(250);
    expect(aiMock.generateJSON.mock.calls[0][0].prompt).toContain("Company: Acme");
    // Matches the other AI routes (45-50s) and stays under Vercel's 60s limit.
    expect(aiMock.generateJSON.mock.calls[0][0].timeoutMs).toBe(45000);
  });
});

describe("POST /api/interview-prep", () => {
  it("caps questions at 20 across groups", async () => {
    const q = (n) => ({ question: `Q${n}?`, lookingFor: "Depth.", answerPointers: ["A", "B"] });
    const many = (k) => Array.from({ length: k }, (_, i) => q(i));
    aiMock.generateJSON.mockResolvedValue({ ok: true, data: { technical: many(12), projectDeepDive: many(8), behavioural: many(5) } });

    const data = await (await post("/interview-prep", { resumeText: RESUME, jdText: JD })).json();
    const total = data.groups.technical.length + data.groups.projectDeepDive.length + data.groups.behavioural.length;
    expect(total).toBe(20);
    expect(aiMock.generateJSON.mock.calls[0][0].prompt).toMatch(/React/);
  });
});

describe("POST /api/skill-gap", () => {
  it("returns deterministic gaps with curated resources when AI isn't configured, without calling AI", async () => {
    aiMock.isAIConfigured.mockReturnValue(false);
    const data = await (await post("/skill-gap", { resumeText: RESUME, jdText: JD })).json();
    expect(data.aiConfigured).toBe(false);
    expect(data.gaps.map((g) => g.skill)).toEqual(expect.arrayContaining(["Node.js", "SQL", "Docker"]));
    expect(data.gaps.every((g) => g.plan === null && g.resources.length > 0)).toBe(true);
    expect(aiMock.generateJSON).not.toHaveBeenCalled();
  });

  it("attaches AI plans and filters untrusted resource links", async () => {
    aiMock.generateJSON.mockResolvedValue({
      ok: true,
      data: {
        gapPlans: [
          {
            skill: "Node.js",
            whyItMatters: "The role builds REST APIs in Node.js.",
            miniPlan: ["Day 1-2: basics", "Day 3-5: Express API", "Week 2: CRUD project"],
            resources: [
              { title: "Fake course", url: "https://free-nodejs-mastery.example/course" },
              { title: "Node.js Learn", url: "https://nodejs.org/en/learn" }
            ]
          }
        ]
      }
    });

    const data = await (await post("/skill-gap", { resumeText: RESUME, jdText: JD })).json();
    const node = data.gaps.find((g) => g.skill === "Node.js");
    expect(node.plan.whyItMatters).toMatch(/REST APIs/);
    expect(node.resources.map((r) => r.url)).not.toContain("https://free-nodejs-mastery.example/course");
    expect(node.resources.map((r) => r.url)).toContain("https://nodejs.org/en/learn");
    expect(data.gaps.find((g) => g.skill === "SQL").plan).toBeNull();
  });

  it("keeps the deterministic result when the AI call fails", async () => {
    aiMock.generateJSON.mockResolvedValue({ ok: false, reason: "timeout" });
    const data = await (await post("/skill-gap", { resumeText: RESUME, jdText: JD })).json();
    expect(data.planError).toBeTruthy();
    expect(data.gaps.length).toBeGreaterThan(0);
  });

  it("reports the active provider's key name and a busy message on a rate limit", async () => {
    aiMock.generateJSON.mockResolvedValue({ ok: false, reason: "rate_limited" });
    const data = await (await post("/skill-gap", { resumeText: RESUME, jdText: JD })).json();
    expect(data.aiKeyName).toBe("COMETAPI_KEY");
    expect(data.planError).toMatch(/^AI is busy, try again in a minute./);
  });
});

describe("POST /api/jobs/search (no JSEARCH_API_KEY)", () => {
  it("returns not-configured with the deterministically resolved role and location", async () => {
    const saved = process.env.JSEARCH_API_KEY;
    delete process.env.JSEARCH_API_KEY;
    const data = await (await post("/jobs/search", { resumeText: RESUME, role: "Software Developer" })).json();
    process.env.JSEARCH_API_KEY = saved ?? "";
    expect(data.configured).toBe(false);
    expect(data.resolvedLocation).toBe("Bengaluru");
  });

  it("asks for a role instead of guessing one when the resume doesn't state it", async () => {
    const res = await post("/jobs/search", { resumeText: "Sam Lee\nsam@example.com\n\nSkills\nReact, Node.js" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Enter a role/);
  });
});

describe("POST /api/jobs/profile", () => {
  it("returns the form defaults: city from the header, fresher flag set", async () => {
    const data = await (await post("/jobs/profile", { resumeText: RESUME })).json();
    expect(data.location).toBe("Bengaluru");
    expect(data.isFresher).toBe(true);
    expect(typeof data.role).toBe("string");
  });
});
