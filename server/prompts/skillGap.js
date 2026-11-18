export const MAX_PLANNED_GAPS = 6;

export function buildSkillGapPrompt({ resumeText, jdText, gaps }) {
  const gapList = gaps
    .slice(0, MAX_PLANNED_GAPS)
    .map((g) => `- ${g.skill} (${g.priority}, mentioned ${g.mentions}x in the JD)`)
    .join("\n");

  return `You are a pragmatic tech mentor. A candidate is missing these skills for a target job:

${gapList}

For EACH skill above, produce:
- "whyItMatters": 1-2 sentences on why it matters for THIS specific role, referencing the job description.
- "miniPlan": 4-6 short, concrete steps covering 1-2 weeks, ending with a small project the candidate could add to their resume. Build on skills they already have where it helps (see resume).
- "resources": 2-3 FREE resources. Only use well-known sources you are certain exist: official documentation home pages, freeCodeCamp (freecodecamp.org), NPTEL (nptel.ac.in), MDN, or a YouTube CHANNEL page (https://www.youtube.com/@channelname — never individual video links). Use https URLs only. If unsure of an exact URL, use the official docs home page.

Resume (for context on existing skills):
"""
${resumeText}
"""

Job description:
"""
${jdText}
"""

Return STRICT JSON only, exactly this shape:
{
  "gapPlans": [
    { "skill": "exact skill name from the list", "whyItMatters": "...", "miniPlan": ["step 1", "step 2"], "resources": [{ "title": "...", "url": "https://..." }] }
  ]
}`;
}

export function validateSkillGapPlans(parsed) {
  return (
    parsed &&
    Array.isArray(parsed.gapPlans) &&
    parsed.gapPlans.every(
      (p) =>
        p &&
        typeof p.skill === "string" &&
        typeof p.whyItMatters === "string" &&
        Array.isArray(p.miniPlan) &&
        p.miniPlan.every((s) => typeof s === "string") &&
        (p.resources === undefined || Array.isArray(p.resources))
    )
  );
}
