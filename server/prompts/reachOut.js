import { NO_FABRICATION_RULE } from "./shared.js";

// LinkedIn caps connection-request notes at 300 characters.
export const LINKEDIN_NOTE_LIMIT = 300;
// The prompt asks for a little less, leaving room for small edits.
const LINKEDIN_TARGET = 280;

export const MESSAGE_TYPES = {
  linkedin_referral: {
    label: "LinkedIn referral request",
    email: false,
    guide: `A LinkedIn connection note to an employee at the company, asking whether they'd be open to referring the candidate (or sharing advice) for this role. Plain text, no subject line, no greeting line break formatting. HARD LIMIT: at most ${LINKEDIN_TARGET} characters including spaces. Name one specific, relevant strength from the resume. End with a light, no-pressure ask.`
  },
  cold_email: {
    label: "Cold email to a recruiter",
    email: true,
    guide: "A short cold email to a recruiter about this role: 90-150 words. Open with the role, give two concrete reasons from the resume that fit the job, and close with a clear ask (a quick call, or where to send the resume)."
  },
  follow_up: {
    label: "Follow-up after applying",
    email: true,
    guide: "A polite follow-up email a week or so after applying: 70-120 words. Mention the role, reaffirm interest with one relevant strength from the resume, and ask about next steps. Never sound impatient."
  },
  thank_you: {
    label: "Thank-you after an interview",
    email: true,
    guide: "A thank-you email after an interview: 80-140 words. Thank them for their time, connect one strength from the resume to the role, and say you look forward to hearing back. Don't invent details of what was discussed in the interview."
  }
};

export const REACH_OUT_TONES = {
  friendly: "Warm and friendly, conversational but still professional.",
  formal: "Formal and polite, a traditional professional register."
};

export function buildReachOutPrompt({ resumeText, jdText, companyName, messageType, recipientName, recipientRole, tone, profile }) {
  const type = MESSAGE_TYPES[messageType];
  const fresherNote = profile.hasWorkExperience
    ? ""
    : "\nThis candidate has NO formal work experience (fresher/student). Never claim or imply a job, internship or employer that isn't in the resume; lean on projects, coursework and skills.";

  const recipient = recipientName
    ? `Recipient: ${recipientName}${recipientRole ? `, ${recipientRole}` : ""}. Address them by first name.`
    : `Recipient: unknown${recipientRole ? ` (${recipientRole})` : ""}. Use a neutral greeting such as "Hi there" (LinkedIn) or "Hello" (email). Never write a placeholder like [Name].`;

  return `You write short, human outreach messages for job seekers. Write one message for the candidate below.

${NO_FABRICATION_RULE}${fresherNote}

Message type: ${type.label}.
${type.guide}
Company: ${companyName}.
${recipient}
Tone: ${REACH_OUT_TONES[tone] || REACH_OUT_TONES.friendly}
Sign off with the candidate's first name if it is clearly the first line of the resume; otherwise no name. No placeholders in square brackets, no emojis, no hashtags.

Candidate resume:
"""
${resumeText}
"""

Job description:
"""
${jdText}
"""

Return STRICT JSON only, exactly this shape:
${type.email ? '{ "subject": "a specific subject line under 80 characters", "message": "the email body, paragraphs separated by \\n\\n" }' : '{ "message": "the LinkedIn note" }'}`;
}

export function validateReachOut(messageType) {
  const email = MESSAGE_TYPES[messageType]?.email;
  return (parsed) =>
    Boolean(
      parsed &&
        typeof parsed.message === "string" &&
        parsed.message.trim().length >= 20 &&
        (!email || (typeof parsed.subject === "string" && parsed.subject.trim().length > 0))
    );
}

// Guarantees a LinkedIn note fits the limit: cut at the last sentence end that
// fits, else the last word boundary (with an ellipsis). Never mid-word.
export function fitToLimit(text, limit = LINKEDIN_NOTE_LIMIT) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const window = clean.slice(0, limit);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentenceEnd >= limit * 0.5) return window.slice(0, sentenceEnd + 1).trim();
  const space = clean.slice(0, limit - 1).lastIndexOf(" ");
  return `${clean.slice(0, space > 0 ? space : limit - 1).replace(/[,;:\s]+$/, "")}…`;
}
