import express from "express";
import { validateBody } from "../middleware/validate.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { generateJSON } from "../lib/aiClient.js";
import { eventContextFrom } from "../lib/events.js";
import { aiFailureMessage } from "../lib/aiConfig.js";
import { extractResumeProfile } from "../scoring/resumeProfile.js";
import {
  buildReachOutPrompt,
  validateReachOut,
  fitToLimit,
  LINKEDIN_NOTE_LIMIT,
  MESSAGE_TYPES,
  REACH_OUT_TONES
} from "../prompts/reachOut.js";

const router = express.Router();

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 8,
  message: "Too many outreach requests. Please wait a minute and try again."
});

router.post("/reach-out", aiRateLimiter, validateBody, async (req, res) => {
  try {
    const { resumeText, jdText, recipientName, recipientRole } = req.body;
    const companyName = (req.body.companyName || "").trim();
    const messageType = req.body.messageType;
    const tone = req.body.tone || "friendly";

    if (!jdText || jdText.trim().length < 20) {
      return res.status(400).json({ error: "Please provide the job description the message is about." });
    }
    if (!companyName) {
      return res.status(400).json({ error: "Please add the company name." });
    }
    if (!MESSAGE_TYPES[messageType]) {
      return res.status(400).json({ error: `messageType must be one of: ${Object.keys(MESSAGE_TYPES).join(", ")}.` });
    }
    if (!REACH_OUT_TONES[tone]) {
      return res.status(400).json({ error: "tone must be friendly or formal." });
    }

    const profile = extractResumeProfile(resumeText);
    const prompt = buildReachOutPrompt({ resumeText, jdText, companyName, messageType, recipientName, recipientRole, tone, profile });
    const aiResult = await generateJSON({
      analytics: { context: eventContextFrom(req), name: "reach_out" },
      prompt,
      maxTokens: 700,
      validate: validateReachOut(messageType),
      timeoutMs: 40000
    });

    if (!aiResult.ok) {
      return res.json({
        configured: aiResult.reason !== "not_configured",
        message: null,
        error: aiFailureMessage(aiResult.reason, {
          notConfigured: "The outreach writer isn't configured yet.",
          failed: "The AI couldn't write this message. Please try again shortly."
        })
      });
    }

    const isEmail = MESSAGE_TYPES[messageType].email;
    const message = isEmail ? aiResult.data.message.trim() : fitToLimit(aiResult.data.message, LINKEDIN_NOTE_LIMIT);
    return res.json({
      configured: true,
      messageType,
      subject: isEmail ? aiResult.data.subject.trim().slice(0, 120) : null,
      message,
      charLimit: isEmail ? null : LINKEDIN_NOTE_LIMIT,
      charCount: message.length
    });
  } catch (err) {
    console.error("Reach out route error:", err);
    return res.status(500).json({ error: "Something went wrong while writing your message. Please try again." });
  }
});

export default router;
