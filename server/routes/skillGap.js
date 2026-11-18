import express from "express";
import { validateBody } from "../middleware/validate.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import { generateJSON, isAIConfigured } from "../lib/aiClient.js";
import { eventContextFrom } from "../lib/events.js";
import { aiFailureMessage, getAIKeyName } from "../lib/aiConfig.js";
import { analyzeSkillGaps } from "../scoring/jobMatch.js";
import { buildSkillGapPrompt, validateSkillGapPlans, MAX_PLANNED_GAPS } from "../prompts/skillGap.js";
import { mergeResources, curatedResourcesFor } from "../prompts/knownResources.js";

const router = express.Router();

const rateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many skill-gap requests. Please wait a minute and try again."
});

router.post("/skill-gap", rateLimiter, validateBody, async (req, res) => {
  try {
    const { resumeText, jdText } = req.body;
    const includePlans = req.body.includePlans !== false;

    if (!jdText || jdText.trim().length < 20) {
      return res.status(400).json({ error: "Please provide a target job description to compare your skills against." });
    }

    const analysis = analyzeSkillGaps(resumeText, jdText);
    const gaps = analysis.gaps.map((g) => ({ ...g, resources: curatedResourcesFor(g.skill).slice(0, 3), plan: null }));

    const base = {
      aiConfigured: isAIConfigured(),
      aiKeyName: getAIKeyName(),
      matchPercent: analysis.matchPercent,
      matchedSkills: analysis.matchedSkills,
      coveredAlternatives: analysis.coveredAlternatives,
      gaps
    };

    if (!includePlans || gaps.length === 0 || !base.aiConfigured) {
      return res.json(base);
    }

    const prompt = buildSkillGapPrompt({ resumeText, jdText, gaps });
    const aiResult = await generateJSON({ analytics: { context: eventContextFrom(req), name: "skill_gap" }, prompt, maxTokens: 2500, validate: validateSkillGapPlans, timeoutMs: 45000 });

    if (!aiResult.ok) {
      const planError = aiFailureMessage(aiResult.reason, {
        notConfigured: "Personalised learning plans aren't configured yet.",
        failed: "Personalised learning plans couldn't be generated right now."
      });
      return res.json({ ...base, planError: `${planError} The skill comparison above is still accurate.` });
    }

    const plansBySkill = new Map(aiResult.data.gapPlans.map((p) => [p.skill.toLowerCase(), p]));
    const withPlans = gaps.map((g, idx) => {
      if (idx >= MAX_PLANNED_GAPS) return g;
      const p = plansBySkill.get(g.skill.toLowerCase());
      if (!p) return g;
      return {
        ...g,
        resources: mergeResources(g.skill, p.resources || []),
        plan: { whyItMatters: p.whyItMatters, miniPlan: p.miniPlan.slice(0, 6) }
      };
    });

    return res.json({ ...base, gaps: withPlans });
  } catch (err) {
    console.error("Skill gap route error:", err);
    return res.status(500).json({ error: "Something went wrong while analysing your skill gaps. Please try again." });
  }
});

export default router;
