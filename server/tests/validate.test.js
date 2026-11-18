import { describe, it, expect } from "vitest";
import { validateTextFields, MAX_RESUME_LENGTH, MAX_JD_LENGTH } from "../middleware/validate.js";

describe("validateTextFields", () => {
  it("rejects a request with no resumeText field at all", () => {
    const errors = validateTextFields({ location: "Bengaluru" });
    expect(errors).toContain("resumeText is required.");
  });

  it("rejects an empty or whitespace-only resumeText", () => {
    expect(validateTextFields({ resumeText: "" })).toContain("resumeText is required.");
    expect(validateTextFields({ resumeText: "   " })).toContain("resumeText is required.");
  });

  it("rejects resumeText longer than the max length", () => {
    const errors = validateTextFields({ resumeText: "a".repeat(MAX_RESUME_LENGTH + 1) });
    expect(errors.some(e => e.includes("resumeText exceeds maximum length"))).toBe(true);
  });

  it("rejects jdText longer than the max length", () => {
    const errors = validateTextFields({ resumeText: "valid resume text", jdText: "b".repeat(MAX_JD_LENGTH + 1) });
    expect(errors.some(e => e.includes("jdText exceeds maximum length"))).toBe(true);
  });

  it("accepts a valid minimal payload with no errors", () => {
    const errors = validateTextFields({ resumeText: "A short valid resume." });
    expect(errors).toEqual([]);
  });

  it("accepts a valid payload with jdText and short fields", () => {
    const errors = validateTextFields({
      resumeText: "A short valid resume.",
      jdText: "A short JD.",
      role: "Software Engineer",
      location: "Bengaluru"
    });
    expect(errors).toEqual([]);
  });
});
