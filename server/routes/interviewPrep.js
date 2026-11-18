import express from "express";
import { validateBody } from "../middleware/validate.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { generateJSON } from "../lib/aiClient.js";
import { eventContextFrom } from "../lib/events.js";
import { aiFailureMessage } from "../lib/aiConfig.js";
import { computeMatchPercent } from "../scoring/jobMatch.js";
import { extractResumeProfile } from "../scoring/resumeProfile.js";
import { buildInterviewPrepPrompt, validateInterviewPrep, capQuestions } from "../prompts/interviewPrep.js";

const router = express.Router();

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 8,
  message: "Too many interview prep requests. Please wait a minute and try again."
});

router.post("/interview-prep", aiRateLimiter, validateBody, async (req, res) => {
  try {
    const { resumeText, jdText } = req.body;

    if (!jdText || jdText.trim().length < 20) {
      return res.status(400).json({ error: "Please provide a target job description to prepare interview questions for." });
    }


    const { matchedKeywords, missingKeywords } = computeMatchPercent(resumeText, jdText);
    const profile = extractResumeProfile(resumeText);
    const prompt = buildInterviewPrepPrompt({
      resumeText,
      jdText,
      matchedSkills: matchedKeywords,
      missingSkills: missingKeywords,
      profile
    });

    const aiResult = await generateJSON({ analytics: { context: eventContextFrom(req), name: "interview_prep" }, prompt, maxTokens: 3500, validate: validateInterviewPrep, timeoutMs: 50000 });

    if (!aiResult.ok) {
      const configured = aiResult.reason !== "not_configured";
      return res.json({
        configured,
        groups: null,
        error: aiFailureMessage(aiResult.reason, {
          notConfigured: "Interview prep isn't configured yet.",
          failed: "The AI interview prep step failed. Please try again shortly."
        })
      });
    }

    return res.json({ configured: true, groups: capQuestions(aiResult.data) });
  } catch (err) {
    console.error("Interview prep route error:", err);
    return res.status(500).json({ error: "Something went wrong while preparing interview questions. Please try again." });
  }
});

export default router;
