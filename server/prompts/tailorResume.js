import { NO_FABRICATION_RULE } from "./shared.js";

// Rules that keep a tailored resume from scoring worse than the original.
// Each one maps to a scoring category that the earlier prompt kept losing:
// repeated job headers in bullets (Experience Quality: bullets must start with
// action verbs), dropped/merged sections (Section Structure), and repeated
// skills (Keyword Match: keyword-stuffing penalty).
const STRUCTURE_RULES = `TAILORING RULES (all mandatory):
1. Keep the original section structure: the same section headings, in the same order. Do not add, merge, rename or drop sections. The candidate's name and contact details are added separately; do not include them.
2. Inside a section, each job, project or degree is an entry. Copy each entry's header line (title, company, dates, location) VERBATIM from the original into "header". Use "" for sections whose bullets have no header line.
3. Bullets must NEVER repeat the job title, company, dates or entry header. Every bullet starts directly with a strong action verb (e.g. "Architected", "Optimized", "Built").
4. Only rephrase or reorder existing content. You may reorder bullets so the most JD-relevant come first, and swap in JD wording for things the original already says. Keep every number and metric exactly as written. Do not drop bullets.
5. Never remove a skill or technology from an original bullet: every tool, language and framework named in an original bullet must still appear in that bullet.
6. Use JD keywords only where the original resume supports them, and don't pile them on: across the whole resume (summary + bullets + skills), no single skill should appear more than 6 times, because ATS systems penalise keyword stuffing beyond that. Mentions that already exist in the original never need to be removed to stay under this limit.
7. Keep the skill categories from the original; reorder skills so JD-relevant ones come first.`;

export function buildTailorResumePrompt({ resumeText, jdText, profile, feedback }) {
  const fresherNote = profile.hasWorkExperience
    ? ""
    : `\nThis candidate has NO formal work experience (fresher/student). Do not write a summary or bullet that implies employment history. Frame them around projects, coursework, and skills instead.`;

  const feedbackNote = feedback
    ? `\n\nYOUR PREVIOUS ATTEMPT SCORED LOWER THAN THE ORIGINAL RESUME (${feedback.attemptScore} vs ${feedback.originalScore} out of 100). Fix these problems in this attempt:\n${feedback.problems.map((p) => `- ${p}`).join("\n")}\nIf in doubt, stay closer to the original wording.`
    : "";

  return `You are an expert resume writer and ATS specialist. Tailor the resume below to the target job description.

${NO_FABRICATION_RULE}${fresherNote}

${STRUCTURE_RULES}${feedbackNote}

Original resume:
"""
${resumeText}
"""

Target job description:
"""
${jdText}
"""

Return STRICT JSON only, with exactly this shape:
{
  "summary": "a 2-4 sentence professional summary rewritten to emphasize relevant, truthful strengths for this JD",
  "sections": [
    {
      "heading": "Work Experience",
      "entries": [
        { "header": "Senior Software Engineer | Acme Corp | Jan 2021 – Present", "bullets": ["Architected ...", "Optimized ..."] }
      ]
    },
    { "heading": "Projects", "entries": [{ "header": "", "bullets": ["Built ..."] }] }
  ],
  "skills": {
    "Languages": ["..."],
    "Frameworks": ["..."]
  },
  "gapsNotAdded": ["skill or requirement from the JD that the candidate's resume does not support, and was therefore NOT added"]
}

Do not include the summary or skills sections inside "sections"; they have their own fields. Keep the JSON valid — no trailing commas, no comments.`;
}

const isEntry = (e) => e && typeof e.header === "string" && Array.isArray(e.bullets) && e.bullets.every((b) => typeof b === "string");
const isLegacyItems = (s) => Array.isArray(s.items) && s.items.every((i) => typeof i === "string");

// Accepts the entries shape, and the older flat { heading, items } shape
// (normalised later by normalizeTailoredSections).
export function validateTailoredResume(parsed) {
  return Boolean(
    parsed &&
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.sections) &&
      parsed.sections.every(
        (s) => s && typeof s.heading === "string" && ((Array.isArray(s.entries) && s.entries.every(isEntry)) || isLegacyItems(s))
      ) &&
      parsed.skills &&
      typeof parsed.skills === "object" &&
      Array.isArray(parsed.gapsNotAdded)
  );
}
