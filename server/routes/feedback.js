import express from "express";
import { getStores } from "../lib/stores.js";
import { getAIModel, getAIProvider } from "../lib/aiConfig.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

// Thumbs up/down on AI results.
// Feedback stores only: feature, rating, reason chip, a short optional comment,
// user id, timestamp, AI provider/model and response time. Never the AI output
// or the resume: anything else in the request body is ignored.

const router = express.Router();

export const FEEDBACK_FEATURES = ["tailor", "cover_letter", "interview_prep", "skill_gap", "reach_out"];
export const FEEDBACK_REASONS = ["made_things_up", "too_generic", "wrong_tone", "bad_formatting", "other"];
export const MAX_FEEDBACK_COMMENT = 300;

const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, message: "Too much feedback at once. Please wait a moment." });

export function buildFeedbackRow(body = {}, user) {
  const errors = [];
  if (!FEEDBACK_FEATURES.includes(body.feature)) errors.push("Unknown feature.");
  if (body.rating !== "up" && body.rating !== "down") errors.push("rating must be up or down.");
  let reason = null;
  let comment = null;
  if (body.rating === "down") {
    if (body.reason !== undefined && body.reason !== null && body.reason !== "") {
      if (!FEEDBACK_REASONS.includes(body.reason)) errors.push("Unknown reason.");
      else reason = body.reason;
    }
    if (typeof body.comment === "string" && body.comment.trim()) {
      // One line, capped: a short note, not a place to paste AI output.
      comment = body.comment.replace(/\s+/g, " ").trim().slice(0, MAX_FEEDBACK_COMMENT);
    }
  }
  const ms = Number(body.responseMs);
  const row = {
    user_id: user.id,
    feature: body.feature,
    rating: body.rating,
    reason,
    comment,
    provider: getAIProvider(),
    model: getAIModel().slice(0, 60),
    response_ms: Number.isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), 10 * 60 * 1000) : null
  };
  return { errors, row };
}

router.post("/feedback", limiter, async (req, res) => {
  try {
    const { errors, row } = buildFeedbackRow(req.body, req.user);
    if (errors.length) return res.status(400).json({ error: errors[0] });
    await getStores().feedback.insert(row);
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Feedback error:", err.message);
    return res.status(500).json({ error: "Couldn't save your feedback." });
  }
});

export default router;
