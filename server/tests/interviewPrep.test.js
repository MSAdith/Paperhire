import { describe, it, expect } from "vitest";
import { validateInterviewPrep, capQuestions } from "../prompts/interviewPrep.js";

const item = (n) => ({ question: `Q${n}?`, lookingFor: "Depth.", answerPointers: ["Point A", "Point B"] });
const many = (count, offset = 0) => Array.from({ length: count }, (_, i) => item(i + offset));

describe("Interview prep validation", () => {
  it("accepts a well-formed response with 15 questions", () => {
    const parsed = { technical: many(6), projectDeepDive: many(5), behavioural: many(4) };
    expect(validateInterviewPrep(parsed)).toBe(true);
  });

  it("rejects missing groups, malformed items, or too few questions", () => {
    expect(validateInterviewPrep({ technical: many(10), projectDeepDive: many(5) })).toBe(false);
    expect(validateInterviewPrep({ technical: [{ question: "Q" }], projectDeepDive: many(5), behavioural: many(5) })).toBe(false);
    expect(validateInterviewPrep({ technical: many(2), projectDeepDive: many(2), behavioural: many(2) })).toBe(false);
    expect(validateInterviewPrep(null)).toBe(false);
  });

  it("caps the total at 20 while keeping every group non-empty", () => {
    const capped = capQuestions({ technical: many(14), projectDeepDive: many(6), behavioural: many(4) });
    const total = capped.technical.length + capped.projectDeepDive.length + capped.behavioural.length;
    expect(total).toBe(20);
    expect(capped.behavioural.length).toBe(4);
    expect(capped.technical.length).toBeLessThan(14);
  });

  it("leaves responses already under the cap untouched", () => {
    const capped = capQuestions({ technical: many(5), projectDeepDive: many(5), behavioural: many(5) });
    expect(capped.technical.length + capped.projectDeepDive.length + capped.behavioural.length).toBe(15);
  });
});
