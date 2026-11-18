import { extractKeywords, matchKeywordSets, createSkillRegex } from "./keywordMatcher.js";
import { SKILL_MAP } from "./skillsDictionary.js";

const PREFERRED_CUES = /\b(preferred|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|a plus|bonus|desirable|optional)\b/i;

// Raw 0-100 keyword overlap percentage between a resume and any target text
// (a job description, a job posting body, etc). Used for job-card match% and
// before/after JD-match% — deliberately simpler than the full 35-point ATS
// keyword category (no similarity bonus, no keyword-stuffing penalty).
export function computeMatchPercent(resumeText, targetText) {
  if (!targetText || targetText.trim().length < 10) {
    return { percent: 0, matchedKeywords: [], missingKeywords: [] };
  }

  const resumeLower = (resumeText || "").toLowerCase();
  const resumeSkills = extractKeywords(resumeText || "");
  const targetKeywords = extractKeywords(targetText);

  if (targetKeywords.size === 0) {
    return { percent: 0, matchedKeywords: [], missingKeywords: [] };
  }

  const { matchedKeywords, missingKeywords, ratio } = matchKeywordSets({
    resumeSkills,
    resumeLower,
    targetKeywords
  });

  return {
    percent: Math.round(ratio * 100),
    matchedKeywords,
    missingKeywords: missingKeywords.map(m => m.skill)
  };
}

// Missing JD skills ranked by how heavily they're emphasized in the JD
// (frequency of mention is used as a proxy for importance).
export function rankMissingSkills(resumeText, jdText) {
  const resumeLower = (resumeText || "").toLowerCase();
  const resumeSkills = extractKeywords(resumeText || "");
  const targetKeywords = extractKeywords(jdText || "");

  const { missingKeywords } = matchKeywordSets({ resumeSkills, resumeLower, targetKeywords });

  return missingKeywords
    .sort((a, b) => b.weight - a.weight)
    .map(m => m.skill);
}

function skillAliasRegexes(skill) {
  const aliases = new Set([skill.toLowerCase()]);
  for (const [syn, canonical] of SKILL_MAP.entries()) {
    if (canonical === skill) aliases.add(syn);
  }
  return [...aliases].map((a) => createSkillRegex(a));
}

function mentionsSkill(text, regexes) {
  return regexes.some((r) => {
    r.lastIndex = 0;
    return r.test(text);
  });
}

// Splits a JD into sentences, each tagged with whether it sits in a
// "nice to have"-style context. A heading line ("Nice to have:", "Requirements:")
// sets the context for the lines beneath it until the next heading; a cue inside
// a sentence ("... is a plus") marks just that sentence. Sentences split on
// .!?; only when followed by whitespace, so "Node.js" and "Next.js" stay intact.
export function parseJdSentences(jdText) {
  const sentences = [];
  let inPreferredSection = false;

  for (const rawLine of (jdText || "").split("\n")) {
    const line = rawLine.replace(/^[\s\-•*–—]+/, "").trim();
    if (!line) continue;

    const headingMatch = line.match(/^([^:]{2,40}):\s*(.*)$/);
    const isHeading = headingMatch && headingMatch[1].trim().split(/\s+/).length <= 5;

    if (isHeading) {
      inPreferredSection = PREFERRED_CUES.test(headingMatch[1]);
      if (!headingMatch[2]) continue;
    }

    for (const part of line.toLowerCase().split(/(?<=[.!?;])\s+/)) {
      const text = part.trim();
      if (text) sentences.push({ text, preferred: inPreferredSection || PREFERRED_CUES.test(text) });
    }
  }
  return sentences;
}

// Extracts the "A, B, or C" lists around each "or" in a sentence, e.g.
// "knowledge of sql databases such as postgresql or mysql" -> [["postgresql", "mysql"]].
// Lists stop at words like "and", "with", "such as", so in "sql and docker or
// kubernetes" only docker/kubernetes are alternatives to each other.
export function alternativeGroups(text) {
  const groups = [];
  const orRe = /\s+or\s+/g;
  let m;
  while ((m = orRe.exec(text))) {
    const left = text.slice(0, m.index);
    const right = text.slice(m.index + m[0].length);
    const leftChunk = left
      .split(/\s+and\s+|\(|:|\s+such as\s+|\s+like\s+|\s+with\s+|\s+of\s+|\s+in\s+|\s+using\s+|\s+e\.g\.?\s+/)
      .pop();
    const leftItems = leftChunk.split(",").map((s) => s.trim()).filter(Boolean);
    const rightItem = right.split(/,|;|\)|\.\s|\.$|\s+and\s+|\s+with\s+|\s+for\s+|\s+to\s+/)[0].trim();
    groups.push([...leftItems, rightItem].filter(Boolean));
  }
  return groups;
}

// A missing skill is "covered" when, in every sentence that mentions it, it's
// listed as an alternative ("PostgreSQL or MySQL") to a skill the resume has.
function findCoveringAlternative(skillRegexes, mentioning, matchedSkillRegexes) {
  if (mentioning.length === 0) return null;
  let coveredBy = null;
  for (const s of mentioning) {
    let hitForSentence = null;
    for (const group of alternativeGroups(s.text)) {
      if (!group.some((item) => mentionsSkill(item, skillRegexes))) continue;
      const hit = matchedSkillRegexes.find(({ regexes }) => group.some((item) => mentionsSkill(item, regexes)));
      if (hit) {
        hitForSentence = hit.skill;
        break;
      }
    }
    if (!hitForSentence) return null;
    coveredBy = coveredBy || hitForSentence;
  }
  return coveredBy;
}

// Full deterministic skill-gap picture for the Skill Gap tab: which JD skills
// the resume already covers, which are missing, ranked required-first then by
// how often the JD mentions them. A skill is "preferred" only if every sentence
// mentioning it is in a nice-to-have context; unlocatable skills default to
// "required". matchPercent stays the same raw overlap used on the other tabs.
export function analyzeSkillGaps(resumeText, jdText) {
  const resumeLower = (resumeText || "").toLowerCase();
  const resumeSkills = extractKeywords(resumeText || "");
  const targetKeywords = extractKeywords(jdText || "");

  const { matchedKeywords, missingKeywords, ratio } = matchKeywordSets({ resumeSkills, resumeLower, targetKeywords });

  const sentences = parseJdSentences(jdText);
  const matchedSkillRegexes = matchedKeywords.map((skill) => ({ skill, regexes: skillAliasRegexes(skill) }));

  const gaps = [];
  const coveredAlternatives = [];

  for (const { skill, weight } of missingKeywords) {
    const regexes = skillAliasRegexes(skill);
    const mentioning = sentences.filter((s) => mentionsSkill(s.text, regexes));

    const coveredBy = findCoveringAlternative(regexes, mentioning, matchedSkillRegexes);
    if (coveredBy) {
      coveredAlternatives.push({ skill, coveredBy });
      continue;
    }

    const preferred = mentioning.length > 0 && mentioning.every((s) => s.preferred);
    gaps.push({ skill, mentions: weight, priority: preferred ? "preferred" : "required" });
  }

  gaps.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "required" ? -1 : 1;
    return b.mentions - a.mentions;
  });

  return {
    matchPercent: targetKeywords.size > 0 ? Math.round(ratio * 100) : 0,
    matchedSkills: matchedKeywords,
    coveredAlternatives,
    gaps
  };
}
