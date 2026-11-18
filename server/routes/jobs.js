import express from "express";
import { searchJobs } from "../services/jsearch.js";
import { computeMatchPercent } from "../scoring/jobMatch.js";
import { extractResumeProfile } from "../scoring/resumeProfile.js";
import { validateBody } from "../middleware/validate.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

const jobsRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many job search requests. Please wait a minute and try again."
});

function flattenJobText(job) {
  const highlightParts = [];
  if (job.job_highlights) {
    for (const key of Object.keys(job.job_highlights)) {
      const val = job.job_highlights[key];
      if (Array.isArray(val)) highlightParts.push(val.join(" "));
    }
  }
  return [job.job_title, job.job_description, highlightParts.join(" ")]
    .filter(Boolean)
    .join(" ");
}

function formatLocation(job) {
  const parts = [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", ");
  return parts || job.job_location || "";
}

// Search-form defaults read from the resume. role/location are "" when the
// resume doesn't state them clearly (header or summary/objective only), so the
// form stays blank rather than guessing. Freshers get the entry-level filter.
export function jobSearchDefaults(resumeText) {
  const profile = extractResumeProfile(resumeText);
  return {
    role: profile.roleTitles[0] || "",
    location: profile.location || "",
    isFresher: !profile.hasWorkExperience
  };
}

router.post("/jobs/profile", jobsRateLimiter, validateBody, (req, res) => {
  return res.json(jobSearchDefaults(req.body.resumeText));
});

router.post("/jobs/search", jobsRateLimiter, validateBody, async (req, res) => {
  try {
    const { resumeText, role, location, remoteOnly, datePosted, fresherFriendly, employmentTypes } = req.body;

    const defaults = jobSearchDefaults(resumeText);
    const effectiveRole = (role && role.trim()) || defaults.role;
    // With no city, search India-wide (country=in) instead of guessing one.
    const effectiveLocation = (location && location.trim()) || defaults.location || "India";

    if (!effectiveRole) {
      return res.status(400).json({ error: "Enter a role to search for. We couldn't find a clear job title in your resume's header or summary." });
    }

    const result = await searchJobs({
      role: effectiveRole,
      location: effectiveLocation,
      country: "in",
      datePosted: datePosted || "month",
      remoteOnly: Boolean(remoteOnly),
      fresherFriendly: Boolean(fresherFriendly),
      employmentTypes: Array.isArray(employmentTypes) ? employmentTypes : []
    });

    if (!result.configured) {
      return res.json({
        configured: false,
        jobs: [],
        resolvedRole: effectiveRole,
        resolvedLocation: effectiveLocation,
        message: "Job search isn't configured yet. Add JSEARCH_API_KEY to enable live job matching."
      });
    }

    if (result.error) {
      return res.json({ configured: true, jobs: [], error: result.error });
    }

    // For the admin dashboard's JSearch quota counter: cached results don't use quota.
    res.locals.jobSearchSource = result.cached ? "cached" : "live";

    const scoredJobs = result.jobs.map(job => {
      const jobText = flattenJobText(job);
      const { percent, missingKeywords } = computeMatchPercent(resumeText, jobText);
      return {
        id: job.job_id,
        title: job.job_title,
        company: job.employer_name,
        location: formatLocation(job) || effectiveLocation,
        postedAt: job.job_posted_at_datetime_utc || job.job_posted_at || null,
        applyLink: job.job_apply_link,
        isRemote: Boolean(job.job_is_remote),
        description: job.job_description || "",
        matchPercent: percent,
        missingSkills: missingKeywords.slice(0, 6)
      };
    });

    scoredJobs.sort((a, b) => b.matchPercent - a.matchPercent);

    return res.json({
      configured: true,
      resolvedRole: effectiveRole,
      resolvedLocation: effectiveLocation,
      jobs: scoredJobs,
      cached: Boolean(result.cached)
    });
  } catch (err) {
    console.error("Job search route error:", err);
    return res.status(500).json({ error: "Something went wrong while searching for jobs. Please try again." });
  }
});

export default router;
