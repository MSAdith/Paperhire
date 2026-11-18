import { cacheGet, cacheSet } from "../lib/cache.js";

const BASE_URL = "https://jsearch.p.rapidapi.com/search-v2";
const CACHE_TTL_MS = 60 * 60 * 1000; // ~1 hour, to stay within the free tier's ~200 req/month cap

// Friendly, actionable messages for RapidAPI's common failures.
export function jsearchErrorMessage(status, body = "") {
  if (status === 403 && /not subscribed/i.test(body)) {
    return "Job search isn't set up yet: your RapidAPI key isn't subscribed to JSearch. Subscribe to JSearch's free Basic plan on RapidAPI, then try again.";
  }
  if (status === 401 || status === 403) {
    return "Job search couldn't sign in to RapidAPI. Check that JSEARCH_API_KEY is your X-RapidAPI-Key.";
  }
  if (status === 429) {
    return "Job search limit reached for now (RapidAPI rate limit or monthly quota). Please try again later.";
  }
  return `The job search provider returned an error (HTTP ${status}). Please try again shortly.`;
}

export function isJSearchConfigured() {
  const key = process.env.JSEARCH_API_KEY;
  return Boolean(key && key.trim() !== "");
}

// JSearch on RapidAPI ("jsearch.p.rapidapi.com"). Verified against the live API
// on 2026-11-10: the old GET /search now returns 404 "Endpoint does not exist";
// GET /search-v2 is current. It returns { data: { jobs: [...], cursor } }, takes
// `work_from_home` for remote-only (`remote_jobs_only` is ignored), and pages by
// cursor rather than `page` (we only fetch the first page). The API echoes the
// parameters it accepted in `parameters`, which is the quickest way to recheck.
export async function searchJobs({
  role,
  location = "",
  country = "in",
  datePosted = "month",
  remoteOnly = false,
  fresherFriendly = false,
  employmentTypes = []
}) {
  if (!isJSearchConfigured()) {
    return { configured: false, jobs: [] };
  }

  const query = location ? `${role} in ${location}` : role;

  const params = new URLSearchParams({
    query,
    num_pages: "1",
    country,
    date_posted: datePosted
  });

  if (employmentTypes.length > 0) {
    params.set("employment_types", employmentTypes.join(","));
  }
  if (remoteOnly) {
    params.set("work_from_home", "true");
  }
  if (fresherFriendly) {
    params.set("job_requirements", "no_experience,under_3_years_experience");
  }

  const cacheKey = params.toString();
  const cached = cacheGet(cacheKey);
  if (cached) {
    return { configured: true, jobs: cached, cached: true };
  }

  const apiKey = process.env.JSEARCH_API_KEY;

  try {
    const response = await fetch(`${BASE_URL}?${params.toString()}`, {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com"
      }
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`JSearch HTTP ${response.status}:`, body.slice(0, 200));
      return { configured: true, jobs: [], error: jsearchErrorMessage(response.status, body) };
    }

    const data = await response.json();
    // v2 nests jobs under data.jobs; accept the old flat array shape too.
    const jobs = Array.isArray(data?.data?.jobs) ? data.data.jobs : Array.isArray(data?.data) ? data.data : [];

    cacheSet(cacheKey, jobs, CACHE_TTL_MS);

    return { configured: true, jobs };
  } catch (err) {
    console.warn("JSearch request failed:", err.message);
    return {
      configured: true,
      jobs: [],
      error: "Could not reach the job search provider. Please try again shortly."
    };
  }
}
