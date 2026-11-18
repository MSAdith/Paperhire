export const NO_FABRICATION_RULE = `STRICT RULE: Never invent jobs, internships, employers, skills, certifications, metrics, or dates that are not explicitly present in the original resume text below. Only reorganize, rephrase, and emphasize what is already there. If the candidate has no work experience, do not write a summary or any line that claims work experience — describe them honestly as a fresher/student with relevant projects and skills instead. If the job description needs a skill the resume does not contain, do not add it anywhere in the output — it must be omitted entirely.`;

export function extractFirstJsonObject(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
