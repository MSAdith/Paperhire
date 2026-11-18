import { describe, it, expect } from "vitest";
import {
  normalizeTailoredSections,
  stripRepeatedHeader,
  extractContactLines,
  renderTailoredToPlainText,
  buildTailoredResumeDocx,
  buildTailoredResumePdf
} from "../docgen/renderResume.js";
import { buildTailorResumePrompt, validateTailoredResume } from "../prompts/tailorResume.js";
import { finalizeAndScore, buildScoreFeedback } from "../routes/tailor.js";
import { analyzeResume } from "../scoring/index.js";

// The real text extracted from sample-resumes/sample_resume.pdf (shortened).
const SAMPLE = `Alex Mercer
Email: alex.mercer@example.com | Phone: (555) 987-6543 | Location: New York, NY
LinkedIn: linkedin.com/in/alexmercer | GitHub: github.com/alexmercer
Professional Summary
Experienced Senior Full Stack Engineer with 6+ years of expertise designing and delivering scalable web applications using React, Node.js, TypeScript, PostgreSQL, and AWS cloud infrastructure.
Work Experience
Senior Software Engineer | Apex Technologies | Jan 2021 – Present
- Spearheaded the migration of monolithic frontend to Next.js and React, improving page load speed by 45%.
- Architected high-throughput REST APIs with Node.js and Express handling 100k daily active users.
Software Engineer | DataFlow Systems | Jun 2018 – Dec 2020
- Engineered real-time data visualization dashboard using React, Redux, and WebSockets.
Education
Bachelor of Science in Computer Science | Columbia University | 2014 – 2018
Technical Skills
Languages: JavaScript, TypeScript, Python, SQL
Frameworks: React, Next.js, Node.js, Express, Redux`;

const SAMPLE_JD = "Junior Software Developer. Requirements: JavaScript and React, REST APIs with Node.js and Express, SQL databases such as PostgreSQL, Git.";

const APEX = "Senior Software Engineer | Apex Technologies | Jan 2021 – Present";

// A faithful tailoring of SAMPLE in the new entries shape.
const FAITHFUL = {
  summary: "Senior Full Stack Engineer with 6+ years building scalable web applications with React, Node.js, TypeScript, PostgreSQL and AWS.",
  sections: [
    {
      heading: "Work Experience",
      entries: [
        {
          header: APEX,
          bullets: [
            "Architected high-throughput REST APIs with Node.js and Express handling 100k daily active users.",
            "Spearheaded the migration of monolithic frontend to Next.js and React, improving page load speed by 45%."
          ]
        },
        { header: "Software Engineer | DataFlow Systems | Jun 2018 – Dec 2020", bullets: ["Engineered real-time data visualization dashboard using React, Redux, and WebSockets."] }
      ]
    },
    { heading: "Education", entries: [{ header: "Bachelor of Science in Computer Science | Columbia University | 2014 – 2018", bullets: [] }] }
  ],
  skills: { Languages: ["JavaScript", "TypeScript", "Python", "SQL"], Frameworks: ["React", "Next.js", "Node.js", "Express", "Redux"] },
  gapsNotAdded: ["Git"]
};

describe("Tailor prompt rules", () => {
  const profile = { hasWorkExperience: true };

  it("forbids repeating entry headers in bullets and requires the original structure", () => {
    const prompt = buildTailorResumePrompt({ resumeText: SAMPLE, jdText: SAMPLE_JD, profile });
    expect(prompt).toMatch(/Bullets must NEVER repeat the job title, company, dates or entry header/);
    expect(prompt).toMatch(/same section headings, in the same order/);
    expect(prompt).toMatch(/VERBATIM/);
    expect(prompt).toMatch(/Only rephrase or reorder existing content/);
    expect(prompt).toMatch(/Never remove a skill or technology from an original bullet/);
    expect(prompt).toMatch(/no single skill should appear more than 6 times/);
    expect(prompt).not.toMatch(/more than 3 times/);
    expect(prompt).toMatch(/"entries"/);
    expect(prompt).not.toMatch(/PREVIOUS ATTEMPT/);
  });

  it("includes score feedback on a retry", () => {
    const prompt = buildTailorResumePrompt({
      resumeText: SAMPLE,
      jdText: SAMPLE_JD,
      profile,
      feedback: { originalScore: 91, attemptScore: 74, problems: ["Experience Quality dropped from 15 to 11/15."] }
    });
    expect(prompt).toMatch(/PREVIOUS ATTEMPT SCORED LOWER THAN THE ORIGINAL RESUME \(74 vs 91/);
    expect(prompt).toContain("- Experience Quality dropped from 15 to 11/15.");
  });

  it("accepts the entries shape and the older flat items shape, and rejects malformed entries", () => {
    expect(validateTailoredResume(FAITHFUL)).toBe(true);
    expect(validateTailoredResume({ ...FAITHFUL, sections: [{ heading: "Projects", items: ["Built x"] }] })).toBe(true);
    expect(validateTailoredResume({ ...FAITHFUL, sections: [{ heading: "X", entries: [{ bullets: ["no header"] }] }] })).toBe(false);
  });
});

describe("Tailored resume structure guardrails", () => {
  it("strips a repeated job header from the start of bullets in the formats the AI produced", () => {
    expect(stripRepeatedHeader("Senior Software Engineer | Apex Technologies (Jan 2021 – Present): Architected REST APIs.", APEX)).toBe("Architected REST APIs.");
    expect(stripRepeatedHeader(`${APEX} - Optimized queries.`, APEX)).toBe("Optimized queries.");
    expect(stripRepeatedHeader("Senior Software Engineer at Apex: optimized queries.", APEX)).toBe("Optimized queries.");
    expect(stripRepeatedHeader("- Built dashboards.", APEX)).toBe("Built dashboards.");
  });

  it("leaves legitimate 'Name: description' bullets alone", () => {
    expect(stripRepeatedHeader("ResumeLens: Built an ATS scoring app with React.", "")).toBe("ResumeLens: Built an ATS scoring app with React.");
  });

  it("normalises the flat items shape and drops summary/skills sections from 'sections'", () => {
    const n = normalizeTailoredSections({
      ...FAITHFUL,
      sections: [{ heading: "Projects", items: ["Built x"] }, { heading: "Technical Skills", items: ["React"] }, { heading: "Summary", items: ["x"] }]
    });
    expect(n.sections).toEqual([{ heading: "Projects", entries: [{ header: "", bullets: ["Built x"] }] }]);
  });

  it("keeps the original contact block verbatim", () => {
    expect(extractContactLines(SAMPLE)).toEqual([
      "Alex Mercer",
      "Email: alex.mercer@example.com | Phone: (555) 987-6543 | Location: New York, NY",
      "LinkedIn: linkedin.com/in/alexmercer | GitHub: github.com/alexmercer"
    ]);
  });

  it("renders contact details and each entry header once, in plain text and downloads", async () => {
    const { tailored } = await finalizeAndScore(FAITHFUL, SAMPLE, SAMPLE_JD);
    const text = renderTailoredToPlainText(tailored);
    expect(text.startsWith("Alex Mercer\nEmail: alex.mercer@example.com")).toBe(true);
    expect(text.match(/Senior Software Engineer \| Apex Technologies/g)).toHaveLength(1);
    expect(text).toContain("- Architected high-throughput REST APIs");
    const docx = await buildTailoredResumeDocx(tailored, "Alex Mercer");
    const pdf = await buildTailoredResumePdf(tailored, "Alex Mercer");
    expect(docx.slice(0, 2).toString()).toBe("PK");
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("a faithful tailoring scores at least as well as the original (no lost contact/structure points)", async () => {
    const before = await analyzeResume(SAMPLE, SAMPLE_JD, { includeAIRewrites: false });
    const { after } = await finalizeAndScore(FAITHFUL, SAMPLE, SAMPLE_JD);
    expect(after.atsScore).toBeGreaterThanOrEqual(before.total);
  });

  it("header-repeating output like the earlier real run no longer loses Experience Quality points", async () => {
    const H = "Senior Software Engineer | Apex Technologies (Jan 2021 – Present): ";
    const repeated = {
      ...FAITHFUL,
      sections: [{ heading: "Work Experience", items: FAITHFUL.sections[0].entries[0].bullets.map((b) => H + b) }, FAITHFUL.sections[1]]
    };
    const before = await analyzeResume(SAMPLE, SAMPLE_JD, { includeAIRewrites: false });
    const { analysis } = await finalizeAndScore(repeated, SAMPLE, SAMPLE_JD);
    const exp = (a) => a.categories.find((c) => c.name === "Experience Quality").score;
    expect(exp(analysis)).toBeGreaterThanOrEqual(exp(before));
  });

  it("explains which categories dropped, for the retry prompt", async () => {
    const before = await analyzeResume(SAMPLE, SAMPLE_JD, { includeAIRewrites: false });
    const worse = await analyzeResume("Summary\nDid some work on web things.", SAMPLE_JD, { includeAIRewrites: false });
    const fb = buildScoreFeedback(before, worse);
    expect(fb.originalScore).toBe(before.total);
    expect(fb.attemptScore).toBe(worse.total);
    expect(fb.problems.some((p) => /^Contact Information dropped from 5 to 0\/5/.test(p))).toBe(true);
  });
});
