import express from "express";
import { validateBody } from "../middleware/validate.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { generateJSON } from "../lib/aiClient.js";
import { eventContextFrom } from "../lib/events.js";
import { aiFailureMessage } from "../lib/aiConfig.js";
import { extractResumeProfile } from "../scoring/resumeProfile.js";
import { buildCoverLetterPrompt, validateCoverLetter, COVER_LETTER_TONES } from "../prompts/coverLetter.js";
import { buildCoverLetterDocx, buildCoverLetterPdf, countWords } from "../docgen/renderCoverLetter.js";

const router = express.Router();

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 8,
  message: "Too many cover letter requests. Please wait a minute and try again."
});

const MAX_LETTER_LENGTH = 6000;

router.post("/cover-letter", aiRateLimiter, validateBody, async (req, res) => {
  try {
    const { resumeText, jdText, companyName, roleTitle } = req.body;
    const tone = req.body.tone || "formal";

    if (!jdText || jdText.trim().length < 20) {
      return res.status(400).json({ error: "Please provide a target job description to write the cover letter for." });
    }
    if (!COVER_LETTER_TONES[tone]) {
      return res.status(400).json({ error: "tone must be one of: formal, confident, concise." });
    }


    const profile = extractResumeProfile(resumeText);
    const prompt = buildCoverLetterPrompt({ resumeText, jdText, companyName, roleTitle, tone, profile });
    // 45s like the other AI routes (default is 25s); within Vercel's 60s maxDuration.
    const aiResult = await generateJSON({ analytics: { context: eventContextFrom(req), name: "cover_letter" }, prompt, maxTokens: 1200, validate: validateCoverLetter, timeoutMs: 45000 });

    if (!aiResult.ok) {
      const configured = aiResult.reason !== "not_configured";
      return res.json({
        configured,
        letter: null,
        error: aiFailureMessage(aiResult.reason, {
          notConfigured: "Cover letter generation isn't configured yet.",
          failed: "The AI cover letter step failed. Please try again shortly."
        })
      });
    }

    const letter = aiResult.data.letter.trim();
    return res.json({ configured: true, letter, wordCount: countWords(letter) });
  } catch (err) {
    console.error("Cover letter route error:", err);
    return res.status(500).json({ error: "Something went wrong while writing your cover letter. Please try again." });
  }
});

router.post("/cover-letter/download", async (req, res) => {
  try {
    const { letter, format } = req.body || {};

    if (typeof letter !== "string" || letter.trim().length === 0) {
      return res.status(400).json({ error: "No cover letter text provided." });
    }
    if (letter.length > MAX_LETTER_LENGTH) {
      return res.status(400).json({ error: `Cover letter exceeds maximum length of ${MAX_LETTER_LENGTH} characters.` });
    }
    if (format !== "docx" && format !== "pdf") {
      return res.status(400).json({ error: "format must be 'docx' or 'pdf'." });
    }

    if (format === "docx") {
      const buffer = await buildCoverLetterDocx(letter);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", "attachment; filename=cover-letter.docx");
      return res.send(buffer);
    }

    const buffer = await buildCoverLetterPdf(letter);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=cover-letter.pdf");
    return res.send(buffer);
  } catch (err) {
    console.error("Cover letter download error:", err);
    return res.status(500).json({ error: "Could not generate the download. Please try again." });
  }
});

export default router;
