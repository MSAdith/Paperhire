import { describe, it, expect } from "vitest";
import { computeMatchPercent, rankMissingSkills } from "../scoring/jobMatch.js";
import { extractResumeProfile } from "../scoring/resumeProfile.js";

const RESUME = `
Alex Mercer
Email: alex.mercer@example.com | Phone: (555) 987-6543 | Location: New York, NY

Professional Summary
Senior Full Stack Engineer with 6+ years of experience in React, Node.js, TypeScript, PostgreSQL, and AWS.

Work Experience
Senior Software Engineer | Apex Technologies | Jan 2021 – Present
- Spearheaded migration to Next.js and React, improving page speed by 45%.
- Architected Node.js REST APIs handling 100k daily users.

Education
Bachelor of Science in Computer Science | Columbia University | 2014 – 2018

Technical Skills
Languages: JavaScript, TypeScript, Python, SQL
Frameworks: React, Node.js, Express
`;

const JD = `
We need a Software Engineer skilled in React, Node.js, TypeScript, Docker, and Kubernetes.
Experience with GraphQL is a plus.
`;

describe("jobMatch deterministic helpers", () => {
  it("computeMatchPercent returns a sane overlap percentage", () => {
    const result = computeMatchPercent(RESUME, JD);
    expect(result.percent).toBeGreaterThan(0);
    expect(result.percent).toBeLessThanOrEqual(100);
    expect(result.matchedKeywords).toContain("React");
    expect(result.matchedKeywords).toContain("Node.js");
    expect(result.missingKeywords).toContain("Docker");
  });

  it("computeMatchPercent returns 0 for empty/short target text", () => {
    expect(computeMatchPercent(RESUME, "").percent).toBe(0);
    expect(computeMatchPercent(RESUME, "hi").percent).toBe(0);
  });

  it("rankMissingSkills sorts missing JD skills by emphasis in the JD", () => {
    const heavyJd = "React React React React Kubernetes is required. React is the main skill.";
    const ranked = rankMissingSkills("No relevant skills here.", heavyJd);
    expect(ranked[0]).toBe("React");
  });
});

describe("extractResumeProfile deterministic extraction", () => {
  it("extracts role titles, top skills, location, and work-experience flag", () => {
    const profile = extractResumeProfile(RESUME);
    expect(profile.roleTitles[0]).toBe("Senior Full Stack Engineer"); // from the summary
    expect(profile.topSkills).toContain("React");
    expect(profile.location).toMatch(/new york/i);
    expect(profile.hasWorkExperience).toBe(true);
  });

  it("flags no work experience for a fresher resume with only projects/education", () => {
    const fresherResume = `
      Jane Student
      Email: jane@example.com

      Education
      B.Tech Computer Science | 2021 – 2025

      Projects
      - Built a React to-do app using JavaScript and Firebase.

      Skills
      JavaScript, React, HTML, CSS
    `;
    const profile = extractResumeProfile(fresherResume);
    expect(profile.hasWorkExperience).toBe(false);
  });

  it("handles empty resume text gracefully", () => {
    const profile = extractResumeProfile("");
    expect(profile.roleTitles).toEqual([]);
    expect(profile.topSkills).toEqual([]);
    expect(profile.location).toBeNull();
    expect(profile.hasWorkExperience).toBe(false);
  });
});

describe("JSearch error messages", () => {
  it("explains a missing JSearch subscription, bad key, and quota limits", async () => {
    const { jsearchErrorMessage } = await import("../services/jsearch.js");
    expect(jsearchErrorMessage(403, '{"message":"You are not subscribed to this API."}')).toMatch(/isn't subscribed to JSearch/);
    expect(jsearchErrorMessage(401, "Invalid API key")).toMatch(/JSEARCH_API_KEY/);
    expect(jsearchErrorMessage(429, "")).toMatch(/limit reached/);
    expect(jsearchErrorMessage(500, "boom")).toMatch(/HTTP 500/);
  });
});

describe("JSearch request/response shape (v2)", () => {
  it("calls /search-v2 with work_from_home and reads jobs from data.jobs", async () => {
    const { vi } = await import("vitest");
    const { searchJobs } = await import("../services/jsearch.js");
    const saved = process.env.JSEARCH_API_KEY;
    process.env.JSEARCH_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ status: "OK", data: { jobs: [{ job_id: "1", job_title: "Dev" }], cursor: "c" } }) }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await searchJobs({ role: "Shape Test Dev", location: "Pune", remoteOnly: true, fresherFriendly: true });
      const url = new URL(fetchMock.mock.calls[0][0]);
      expect(url.pathname).toBe("/search-v2");
      expect(url.searchParams.get("work_from_home")).toBe("true");
      expect(url.searchParams.get("remote_jobs_only")).toBeNull();
      expect(url.searchParams.get("query")).toBe("Shape Test Dev in Pune");
      expect(url.searchParams.get("job_requirements")).toBe("no_experience,under_3_years_experience");
      expect(result.jobs).toEqual([{ job_id: "1", job_title: "Dev" }]);
    } finally {
      vi.unstubAllGlobals();
      if (saved === undefined) delete process.env.JSEARCH_API_KEY;
      else process.env.JSEARCH_API_KEY = saved;
    }
  });
});
