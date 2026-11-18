import { describe, it, expect } from "vitest";
import {
  stripHallucinatedSkills,
  renderTailoredToPlainText,
  buildTailoredResumeDocx,
  buildTailoredResumePdf
} from "../docgen/renderResume.js";
import { guessCandidateName } from "../routes/tailor.js";
import { validateTailoredResume } from "../prompts/tailorResume.js";

const RESUME = `Priya Sharma
priya@example.com | +91 98765 43210
Projects
- Built a React to-do app with JavaScript and Firebase.
Skills
JavaScript, React, HTML, CSS`;

const TAILORED = {
  summary: "Fresher developer focused on React and JavaScript.",
  sections: [{ heading: "Projects", items: ["Built a React to-do app with Firebase auth."] }],
  skills: { Languages: ["JavaScript", "TypeScript"], Frameworks: ["React", "Kubernetes"] },
  gapsNotAdded: []
};

describe("Tailored resume guardrails and rendering", () => {
  it("strips skills not present in the original resume and moves them to gaps", () => {
    const cleaned = stripHallucinatedSkills(TAILORED, RESUME);
    expect(cleaned.skills.Languages).toEqual(["JavaScript"]);
    expect(cleaned.skills.Frameworks).toEqual(["React"]);
    expect(cleaned.gapsNotAdded).toContain("TypeScript");
    expect(cleaned.gapsNotAdded).toContain("Kubernetes");
  });

  it("drops a skill category entirely if all its skills were stripped", () => {
    const cleaned = stripHallucinatedSkills(
      { ...TAILORED, skills: { Cloud: ["AWS", "GCP"] } },
      RESUME
    );
    expect(cleaned.skills.Cloud).toBeUndefined();
  });

  it("renders tailored JSON to plain text with headings and bullets", () => {
    const text = renderTailoredToPlainText(TAILORED);
    expect(text).toContain("Projects");
    expect(text).toContain("- Built a React to-do app");
    expect(text).toContain("Languages: JavaScript, TypeScript");
  });

  it("validates the expected AI response shape", () => {
    expect(validateTailoredResume(TAILORED)).toBe(true);
    expect(validateTailoredResume({ summary: "x" })).toBe(false);
    expect(validateTailoredResume(null)).toBeFalsy();
  });

  it("guesses the candidate name from the first line, with a safe fallback", () => {
    expect(guessCandidateName(RESUME)).toBe("Priya Sharma");
    expect(guessCandidateName("Email: a@b.com | 555-123-4567")).toBe("Candidate");
    expect(guessCandidateName("")).toBe("Candidate");
  });

  it("generates a non-empty DOCX buffer (zip signature)", async () => {
    const buffer = await buildTailoredResumeDocx(TAILORED, "Priya Sharma");
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.slice(0, 2).toString()).toBe("PK");
  });

  it("generates a non-empty PDF buffer (%PDF signature)", async () => {
    const buffer = await buildTailoredResumePdf(TAILORED, "Priya Sharma");
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.slice(0, 4).toString()).toBe("%PDF");
  });
});
