import { describe, it, expect } from "vitest";
import { analyzeSkillGaps } from "../scoring/jobMatch.js";
import { isTrustedResourceUrl, mergeResources, curatedResourcesFor } from "../prompts/knownResources.js";
import { validateSkillGapPlans } from "../prompts/skillGap.js";

const RESUME = `Priya Sharma
Projects
- Built a React to-do app with JavaScript and Firebase.
Skills
JavaScript, React, HTML, CSS`;

const JD = `Junior Software Developer - Bengaluru
Requirements:
- Strong knowledge of React and JavaScript.
- Experience building REST APIs with Node.js. Node.js is used across all our services.
- Working knowledge of SQL databases.
Nice to have: Docker.
Familiarity with AWS is a plus.`;

describe("analyzeSkillGaps (deterministic)", () => {
  const result = analyzeSkillGaps(RESUME, JD);
  const skills = result.gaps.map((g) => g.skill);

  it("splits JD skills into matched and missing", () => {
    expect(result.matchedSkills).toEqual(expect.arrayContaining(["React", "JavaScript"]));
    expect(skills).toEqual(expect.arrayContaining(["Node.js", "SQL", "Docker", "AWS"]));
    expect(skills).not.toContain("React");
  });

  it("classifies nice-to-have skills as preferred and the rest as required", () => {
    const byName = Object.fromEntries(result.gaps.map((g) => [g.skill, g.priority]));
    expect(byName["Docker"]).toBe("preferred");
    expect(byName["AWS"]).toBe("preferred");
    expect(byName["Node.js"]).toBe("required");
    expect(byName["SQL"]).toBe("required");
  });

  it("ranks required gaps first, then by JD mention count", () => {
    const firstPreferred = result.gaps.findIndex((g) => g.priority === "preferred");
    const lastRequired = result.gaps.map((g) => g.priority).lastIndexOf("required");
    expect(lastRequired).toBeLessThan(firstPreferred);
    expect(result.gaps[0].skill).toBe("Node.js");
  });

  it("returns a 0-100 match percent", () => {
    expect(result.matchPercent).toBeGreaterThan(0);
    expect(result.matchPercent).toBeLessThan(100);
  });
});

describe("analyzeSkillGaps on a heading-style JD", () => {
  const RESUME_PG = `Alex Mercer
Skills
Languages: JavaScript, SQL
Frameworks: React, Node.js
Databases: PostgreSQL`;

  const HEADING_JD = `Junior Software Developer - Bengaluru

Requirements:
- Strong fundamentals in JavaScript and React.
- Working knowledge of SQL databases such as PostgreSQL or MySQL.
- Familiarity with Git and code reviews.

Nice to have:
- Docker and basic CI/CD exposure.
- Kubernetes.

Responsibilities:
- Write unit tests with Jest.`;

  const result = analyzeSkillGaps(RESUME_PG, HEADING_JD);
  const byName = Object.fromEntries(result.gaps.map((g) => [g.skill, g.priority]));

  it("treats 'Familiarity with X' under Requirements as required", () => {
    expect(byName["Git"]).toBe("required");
  });

  it("treats bullets under a 'Nice to have:' heading as preferred", () => {
    expect(byName["Docker"]).toBe("preferred");
    expect(byName["Kubernetes"]).toBe("preferred");
    expect(byName["CI/CD"]).toBe("preferred");
  });

  it("ends the preferred section at the next heading", () => {
    expect(byName["Jest"]).toBe("required");
  });

  it("does not flag an 'X or Y' alternative when the resume already has one of them", () => {
    expect(byName["MySQL"]).toBeUndefined();
    expect(result.coveredAlternatives).toEqual(expect.arrayContaining([{ skill: "MySQL", coveredBy: "PostgreSQL" }]));
  });

  it("only treats skills inside the same 'A, B or C' list as alternatives", () => {
    const r = analyzeSkillGaps("Skills: SQL, React", "Requirements:\n- Experience with SQL and Docker or Kubernetes.\n- React, Angular, or Vue.");
    const gapSkills = r.gaps.map((g) => g.skill);
    expect(gapSkills).toEqual(expect.arrayContaining(["Docker", "Kubernetes"]));
    expect(gapSkills).not.toContain("Angular");
    expect(gapSkills).not.toContain("Vue");
    expect(r.coveredAlternatives).toEqual(expect.arrayContaining([{ skill: "Vue", coveredBy: "React" }]));
  });
});

describe("resource link safety", () => {
  it("accepts https links on allowlisted domains, including subdomains", () => {
    expect(isTrustedResourceUrl("https://react.dev/learn")).toBe(true);
    expect(isTrustedResourceUrl("https://www.freecodecamp.org/news/")).toBe(true);
    expect(isTrustedResourceUrl("https://docs.github.com/en/actions")).toBe(true);
  });

  it("rejects unknown domains, http, lookalike hosts, and garbage", () => {
    expect(isTrustedResourceUrl("https://totally-real-courses.example/react")).toBe(false);
    expect(isTrustedResourceUrl("http://react.dev/learn")).toBe(false);
    expect(isTrustedResourceUrl("https://react.dev.evil.com/learn")).toBe(false);
    expect(isTrustedResourceUrl("not a url")).toBe(false);
  });

  it("allows YouTube channel pages but not individual video links", () => {
    expect(isTrustedResourceUrl("https://www.youtube.com/@freecodecamp")).toBe(true);
    expect(isTrustedResourceUrl("https://www.youtube.com/watch?v=abc123")).toBe(false);
  });

  it("merges trusted AI links with curated ones, dropping untrusted, max 3", () => {
    const merged = mergeResources("Docker", [
      { title: "Fake", url: "https://made-up-site.example/docker" },
      { title: "Docker docs", url: "https://docs.docker.com/get-started/" },
      { title: "Video", url: "https://www.youtube.com/watch?v=xyz" }
    ]);
    const urls = merged.map((r) => r.url);
    expect(urls).not.toContain("https://made-up-site.example/docker");
    expect(urls).not.toContain("https://www.youtube.com/watch?v=xyz");
    expect(urls.filter((u) => u.startsWith("https://docs.docker.com/get-started")).length).toBe(1);
    expect(merged.length).toBeLessThanOrEqual(3);
  });

  it("falls back to generic free resources for skills without a curated entry", () => {
    expect(curatedResourcesFor("Some Obscure Tool").length).toBeGreaterThan(0);
  });

  it("every curated link passes the trust check itself", () => {
    for (const skill of ["JavaScript", "React", "Docker", "AWS", "SQL", "Machine Learning", "Some Obscure Tool"]) {
      for (const r of curatedResourcesFor(skill)) {
        expect(isTrustedResourceUrl(r.url), r.url).toBe(true);
      }
    }
  });
});

describe("skill gap plan validation", () => {
  it("accepts well-formed plans and rejects malformed ones", () => {
    expect(validateSkillGapPlans({ gapPlans: [{ skill: "Docker", whyItMatters: "x", miniPlan: ["a"], resources: [] }] })).toBe(true);
    expect(validateSkillGapPlans({ gapPlans: [{ skill: "Docker" }] })).toBe(false);
    expect(validateSkillGapPlans({})).toBeFalsy();
  });
});
