import express from "express";
import { analyzeResume } from "../scoring/index.js";
import { computeMatchPercent } from "../scoring/jobMatch.js";
import { extractResumeProfile } from "../scoring/resumeProfile.js";
import { validateBody } from "../middleware/validate.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { generateJSON } from "../lib/aiClient.js";
import { eventContextFrom } from "../lib/events.js";
import { aiFailureMessage } from "../lib/aiConfig.js";
import { buildTailorResumePrompt, validateTailoredResume } from "../prompts/tailorResume.js";
import {
  stripHallucinatedSkills,
  normalizeTailoredSections,
  stripRepeatedHeaders,
  extractContactLines,
  renderTailoredToPlainText,
  buildTailoredResumeDocx,
  buildTailoredResumePdf
} from "../docgen/renderResume.js";

const router = express.Router();

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 8,
  message: "Too many requests to the AI tailoring feature. Please wait a minute and try again."
});

// Both AI attempts must fit Vercel's 60s maxDuration (vercel.json) with room
// for scoring; a retry only starts if it can get a meaningful time slice.
const TOTAL_AI_BUDGET_MS = 55000;
const FIRST_ATTEMPT_TIMEOUT_MS = 40000;
const MIN_RETRY_MS = 15000;

// Applies the deterministic guardrails to raw AI output, then scores it the
// same way the original was scored.
export async function finalizeAndScore(raw, resumeText, jdText) {
  const tailored = {
    ...stripRepeatedHeaders(normalizeTailoredSections(stripHallucinatedSkills(raw, resumeText))),
    contactLines: extractContactLines(resumeText)
  };
  const afterText = renderTailoredToPlainText(tailored);
  const analysis = await analyzeResume(afterText, jdText, { includeAIRewrites: false });
  const match = computeMatchPercent(afterText, jdText);
  return { tailored, analysis, after: { atsScore: analysis.total, jdMatchPercent: match.percent } };
}

// Category-level reasons a tailored attempt scored lower, fed back to the AI.
export function buildScoreFeedback(beforeAnalysis, attemptAnalysis) {
  const problems = [];
  attemptAnalysis.categories.forEach((cat, i) => {
    const orig = beforeAnalysis.categories[i];
    if (!orig || cat.score >= orig.score) return;
    const why = [...cat.findings, ...cat.fixes].filter((f) => !orig.findings.includes(f)).slice(0, 3).join(" ");
    problems.push(`${cat.name} dropped from ${orig.score} to ${cat.score}/${cat.max}.${why ? ` ${why}` : ""}`);
  });
  return { originalScore: beforeAnalysis.total, attemptScore: attemptAnalysis.total, problems };
}

export function guessCandidateName(resumeText) {
  const firstLine = (resumeText || "").split("\n").map(l => l.trim()).find(l => l.length > 0) || "";
  const words = firstLine.split(/\s+/);
  const looksLikeName = words.length >= 1 && words.length <= 4 && /^[A-Za-z.'\-\s]+$/.test(firstLine) && firstLine.length < 50;
  return looksLikeName ? firstLine : "Candidate";
}

router.post("/tailor", aiRateLimiter, validateBody, async (req, res) => {
  try {
    const { resumeText, jdText } = req.body;

    if (!jdText || jdText.trim().length < 20) {
      return res.status(400).json({ error: "Please provide a target job description to tailor your resume against." });
    }

    const beforeAnalysis = await analyzeResume(resumeText, jdText, { includeAIRewrites: false });
    const beforeMatch = computeMatchPercent(resumeText, jdText);
    const before = { atsScore: beforeAnalysis.total, jdMatchPercent: beforeMatch.percent };

    const profile = extractResumeProfile(resumeText);
    const startedAt = Date.now();
    const runAttempt = (feedback, timeoutMs) =>
      generateJSON({
        analytics: { context: eventContextFrom(req), name: "tailor" },
        prompt: buildTailorResumePrompt({ resumeText, jdText, profile, feedback }),
        maxTokens: 3000,
        validate: validateTailoredResume,
        timeoutMs
      });

    const aiResult = await runAttempt(null, FIRST_ATTEMPT_TIMEOUT_MS);

    if (!aiResult.ok) {
      const configured = aiResult.reason !== "not_configured";
      return res.json({
        configured,
        tailored: null,
        before,
        after: null,
        error: aiFailureMessage(aiResult.reason, {
          notConfigured: "Resume tailoring isn't configured yet.",
          failed: "The AI tailoring step failed. Please try again shortly."
        })
      });
    }

    let best = await finalizeAndScore(aiResult.data, resumeText, jdText);
    let attempts = 1;

    // Backstop: a tailored resume must not score lower than the original.
    // Retry once with category-level feedback if it does.
    const remainingMs = TOTAL_AI_BUDGET_MS - (Date.now() - startedAt);
    if (best.after.atsScore < before.atsScore && remainingMs >= MIN_RETRY_MS) {
      const feedback = buildScoreFeedback(beforeAnalysis, best.analysis);
      const retry = await runAttempt(feedback, remainingMs - 3000);
      attempts = 2;
      if (retry.ok) {
        const second = await finalizeAndScore(retry.data, resumeText, jdText);
        if (second.after.atsScore >= best.after.atsScore) best = second;
      }
    }

    if (best.after.atsScore < before.atsScore) {
      return res.json({
        configured: true,
        tailored: null,
        keptOriginal: true,
        attempts,
        before,
        after: before,
        bestAttempt: best.after,
        note: `We kept your original resume. The best tailored version scored ${best.after.atsScore}/100, lower than your original's ${before.atsScore}/100, so it wasn't an improvement. Try editing the job description to focus on the role's key requirements, or use the Skill Gap tab to see what to add.`
      });
    }

    return res.json({ configured: true, tailored: best.tailored, before, after: best.after, attempts });
  } catch (err) {
    console.error("Tailor route error:", err);
    return res.status(500).json({ error: "Something went wrong while tailoring your resume. Please try again." });
  }
});

router.post("/tailor/download", async (req, res) => {
  try {
    const { tailored, format, resumeText } = req.body;

    if (!tailored || typeof tailored !== "object") {
      return res.status(400).json({ error: "No tailored resume content provided." });
    }
    if (format !== "docx" && format !== "pdf") {
      return res.status(400).json({ error: "format must be 'docx' or 'pdf'." });
    }

    const candidateName = guessCandidateName(resumeText);

    if (format === "docx") {
      const buffer = await buildTailoredResumeDocx(tailored, candidateName);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", "attachment; filename=tailored-resume.docx");
      return res.send(buffer);
    }

    const buffer = await buildTailoredResumePdf(tailored, candidateName);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=tailored-resume.pdf");
    return res.send(buffer);
  } catch (err) {
    console.error("Tailor download route error:", err);
    return res.status(500).json({ error: "Could not generate the download. Please try again." });
  }
});

export default router;
