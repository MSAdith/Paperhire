import { NO_FABRICATION_RULE } from "./shared.js";

export const QUESTION_GROUPS = ["technical", "projectDeepDive", "behavioural"];

export function buildInterviewPrepPrompt({ resumeText, jdText, matchedSkills, missingSkills, profile }) {
  return `You are a senior technical interviewer preparing a candidate for an interview.

Using the resume and job description below, write 15-20 likely interview questions in three groups:
- "technical": about the JD's key skills. Prioritize these skills the candidate has: ${matchedSkills.join(", ") || "none detected"}. Also include 1-2 on skills the JD wants but the resume lacks, so they can prepare an honest answer: ${missingSkills.slice(0, 5).join(", ") || "none"}.
- "projectDeepDive": probing questions about the candidate's OWN projects/experience as written in the resume.
- "behavioural": HR and behavioural questions relevant to this role${profile.hasWorkExperience ? "" : " for a fresher (team projects, college, internships only if listed)"}.

For every question give:
- "lookingFor": one sentence on what the interviewer is really assessing.
- "answerPointers": 2-3 short pointers the candidate can use, drawn ONLY from facts in their resume. If the resume has nothing relevant (e.g. a missing skill), say so honestly and suggest how to frame a learning-oriented answer.

${NO_FABRICATION_RULE}

Resume:
"""
${resumeText}
"""

Job description:
"""
${jdText}
"""

Return STRICT JSON only, exactly this shape:
{
  "technical": [{ "question": "...", "lookingFor": "...", "answerPointers": ["...", "..."] }],
  "projectDeepDive": [ ... same item shape ... ],
  "behavioural": [ ... same item shape ... ]
}`;
}

function isValidItem(item) {
  return (
    item &&
    typeof item.question === "string" &&
    item.question.trim().length > 0 &&
    typeof item.lookingFor === "string" &&
    Array.isArray(item.answerPointers) &&
    item.answerPointers.every((p) => typeof p === "string")
  );
}

export function validateInterviewPrep(parsed) {
  if (!parsed) return false;
  let total = 0;
  for (const group of QUESTION_GROUPS) {
    if (!Array.isArray(parsed[group]) || !parsed[group].every(isValidItem)) return false;
    total += parsed[group].length;
  }
  return total >= 10 && total <= 30;
}

// Caps the total at 20, trimming from the largest group first so every group survives.
export function capQuestions(parsed, max = 20) {
  const groups = Object.fromEntries(QUESTION_GROUPS.map((g) => [g, [...parsed[g]]]));
  let total = QUESTION_GROUPS.reduce((n, g) => n + groups[g].length, 0);
  while (total > max) {
    const largest = QUESTION_GROUPS.reduce((a, b) => (groups[a].length >= groups[b].length ? a : b));
    groups[largest].pop();
    total--;
  }
  return groups;
}
