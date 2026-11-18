import { NO_FABRICATION_RULE } from "./shared.js";

export const COVER_LETTER_TONES = {
  formal: "Formal and polished, traditional business-letter register.",
  confident: "Confident and direct, energetic but never arrogant or exaggerated.",
  concise: "Concise and to the point — short paragraphs, no filler, aim for the lower end of the word range."
};

export function buildCoverLetterPrompt({ resumeText, jdText, companyName, roleTitle, tone, profile }) {
  const toneGuide = COVER_LETTER_TONES[tone] || COVER_LETTER_TONES.formal;
  const fresherNote = profile.hasWorkExperience
    ? ""
    : "\nThis candidate has NO formal work experience. Do not claim or imply any employment history; lean on projects, coursework, and skills.";

  const target = [roleTitle && `Role: ${roleTitle}`, companyName && `Company: ${companyName}`]
    .filter(Boolean)
    .join("\n");

  return `You are an expert career coach. Write a cover letter for the candidate below, targeted at the job description.

${NO_FABRICATION_RULE}${fresherNote}

Tone: ${toneGuide}
Length: 250-350 words for the body.
${target ? `\n${target}\n` : ""}
If the company name is not given, address it generically ("Dear Hiring Manager") and do not invent a company name. Do not include placeholder brackets like [Your Address]. Sign off with the candidate's name if it is clearly the first line of the resume, otherwise "Sincerely,".

Candidate resume:
"""
${resumeText}
"""

Job description:
"""
${jdText}
"""

Return STRICT JSON only, exactly this shape:
{ "letter": "the full cover letter text, paragraphs separated by \\n\\n" }`;
}

export function validateCoverLetter(parsed) {
  return parsed && typeof parsed.letter === "string" && parsed.letter.trim().split(/\s+/).length >= 80;
}
