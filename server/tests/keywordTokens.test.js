import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { extractKeywords, scoreKeywordMatch, createSkillRegex } from "../scoring/keywordMatcher.js";

const counts = (text) => Object.fromEntries(extractKeywords(text));
const fixture = (name) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");

describe("Keyword matching counts whole tokens only", () => {
  it("does not count Node.js, Next.js or TypeScript as JavaScript", () => {
    expect(counts("Node.js")).toEqual({ "Node.js": 1 });
    expect(counts("Next.js")).toEqual({ "Next.js": 1 });
    expect(counts("TypeScript")).toEqual({ TypeScript: 1 });
    expect(counts("Built with Node.js and Next.js")).not.toHaveProperty("JavaScript");
  });

  it("does not count JavaScript as Java", () => {
    expect(counts("JavaScript")).toEqual({ JavaScript: 1 });
    expect(counts("Java and JavaScript")).toEqual({ Java: 1, JavaScript: 1 });
  });

  it("still matches genuine standalone mentions, including aliases and sentence punctuation", () => {
    expect(counts("Wrote it in JS.").JavaScript).toBe(1);
    expect(counts("React. Then React, react!").React).toBe(3);
    expect(counts("Node, Node.js and NodeJS")["Node.js"]).toBe(3);
  });

  it("counts one mention once even when several aliases of the skill match it", () => {
    expect(counts("Next.js")["Next.js"]).toBe(1);
    expect(counts("core java").Java).toBe(1);
  });

  it("keeps symbol-suffixed languages distinct", () => {
    const re = createSkillRegex("c");
    expect("c++ and c#".match(re)).toBeNull();
    expect(counts("C++ and C#")).toEqual({ "C++": 1, "C#": 1 });
  });
});

describe("Keyword stuffing penalty", () => {
  it("is not triggered by framework names (the old false positive)", () => {
    // 3x Node.js + 2x Next.js + 2x JavaScript used to count as "JavaScript (7x)".
    const text = "JavaScript developer. Node.js APIs, Node.js workers, Node.js CLI. Next.js site, Next.js blog. JavaScript tooling.";
    const result = scoreKeywordMatch(text, "");
    expect(result.findings.join(" ")).not.toMatch(/Keyword stuffing/);
  });

  it("still triggers on genuine repetition", () => {
    const text = Array.from({ length: 7 }, () => "Expert in JavaScript.").join(" ");
    const result = scoreKeywordMatch(text, "");
    expect(result.findings.join(" ")).toMatch(/Keyword stuffing detected for "JavaScript" \(7x\)/);
  });

  it("still penalises the keyword_stuffed fixture (React repeated 25x)", () => {
    const result = scoreKeywordMatch(fixture("keyword_stuffed.txt"), fixture("frontend_jd.txt"));
    expect(result.findings.join(" ")).toMatch(/Keyword stuffing detected for "React" \(25x\)/);
  });

  it("no longer flags the strong_fresher fixture, which mentions JavaScript once", () => {
    const text = fixture("strong_fresher.txt");
    expect(extractKeywords(text).get("JavaScript")).toBe(1);
    expect(scoreKeywordMatch(text, "").findings.join(" ")).not.toMatch(/Keyword stuffing/);
  });
});
