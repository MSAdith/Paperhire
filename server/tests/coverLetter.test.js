import { describe, it, expect } from "vitest";
import { countWords, buildCoverLetterDocx, buildCoverLetterPdf } from "../docgen/renderCoverLetter.js";
import { validateCoverLetter, buildCoverLetterPrompt } from "../prompts/coverLetter.js";
import { NO_FABRICATION_RULE } from "../prompts/shared.js";

const LETTER = `Dear Hiring Manager,\n\n${"I am excited to apply. ".repeat(30)}\n\nSincerely,\nPriya Sharma`;

describe("Cover letter helpers", () => {
  it("counts words", () => {
    expect(countWords("one two  three\nfour")).toBe(4);
    expect(countWords("")).toBe(0);
  });

  it("rejects AI responses that are missing or too short", () => {
    expect(validateCoverLetter({ letter: LETTER })).toBe(true);
    expect(validateCoverLetter({ letter: "Too short." })).toBe(false);
    expect(validateCoverLetter({})).toBeFalsy();
  });

  it("always includes the no-fabrication rule, and a fresher note when there's no work experience", () => {
    const prompt = buildCoverLetterPrompt({
      resumeText: "x",
      jdText: "y",
      tone: "concise",
      profile: { hasWorkExperience: false }
    });
    expect(prompt).toContain(NO_FABRICATION_RULE);
    expect(prompt).toMatch(/NO formal work experience/);
  });

  it("generates valid DOCX and PDF buffers", async () => {
    const docx = await buildCoverLetterDocx(LETTER);
    expect(docx.slice(0, 2).toString()).toBe("PK");
    const pdf = await buildCoverLetterPdf(LETTER);
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
  });
});
