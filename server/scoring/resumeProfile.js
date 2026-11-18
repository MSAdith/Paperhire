import { extractKeywords } from "./keywordMatcher.js";

// Common tech/business job titles, longest/most-specific first so e.g.
// "Senior Full Stack Engineer" is preferred over a bare "Engineer" match.
const JOB_TITLE_PATTERNS = [
  "senior full stack engineer", "full stack developer", "full stack engineer",
  "senior software engineer", "software engineer", "software developer",
  "backend developer", "backend engineer", "frontend developer", "frontend engineer",
  "data scientist", "data analyst", "data engineer", "machine learning engineer",
  "ml engineer", "devops engineer", "site reliability engineer", "cloud engineer",
  "mobile developer", "android developer", "ios developer", "react developer",
  "node.js developer", "python developer", "java developer", "qa engineer",
  "test engineer", "product manager", "project manager", "business analyst",
  "ui/ux designer", "ux designer", "ui designer", "systems engineer",
  "security engineer", "network engineer", "database administrator", "dba",
  "technical lead", "engineering manager", "web developer", "application developer",
  "junior developer", "associate software engineer", "intern", "graduate engineer trainee"
];

const INDIAN_CITIES = [
  "bengaluru", "bangalore", "mumbai", "navi mumbai", "thane", "delhi", "new delhi", "hyderabad",
  "secunderabad", "pune", "chennai", "kolkata", "ahmedabad", "gurugram", "gurgaon", "noida",
  "greater noida", "faridabad", "ghaziabad", "jaipur", "chandigarh", "mohali", "kochi", "cochin",
  "thiruvananthapuram", "trivandrum", "kozhikode", "calicut", "thrissur", "coimbatore", "madurai",
  "tiruchirappalli", "trichy", "mysuru", "mysore", "mangaluru", "mangalore", "hubli", "indore",
  "bhopal", "nagpur", "nashik", "aurangabad", "lucknow", "kanpur", "varanasi", "patna", "ranchi",
  "bhubaneswar", "visakhapatnam", "vizag", "vijayawada", "warangal", "surat", "vadodara", "rajkot",
  "goa", "panaji", "dehradun", "guwahati", "raipur", "jodhpur", "udaipur", "amritsar", "ludhiana"
];

const GLOBAL_CITIES = [
  "new york", "san francisco", "seattle", "austin", "boston", "london",
  "toronto", "vancouver", "singapore", "dubai", "berlin", "amsterdam"
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// Whole-phrase, case-insensitive matcher: "pune" must not match "opportune",
// and "product manager" must not match "product managers".
const phraseRegex = (phrase) => new RegExp(`(?<![\\w/.])${escapeRegex(phrase).replace(/\s+/g, "\\s+")}(?![\\w/])`, "i");

// Longest first so "new delhi" wins over "delhi" and "navi mumbai" over "mumbai".
const CITY_REGEXES = [...INDIAN_CITIES, ...GLOBAL_CITIES]
  .sort((a, b) => b.length - a.length)
  .map(phraseRegex);

const TITLE_REGEXES = JOB_TITLE_PATTERNS.map((title) => ({ title, regex: phraseRegex(title) }));

const SUMMARY_HEADINGS = [
  "summary", "professional summary", "career summary", "profile", "professional profile",
  "profile summary", "objective", "career objective", "professional objective", "about me", "about"
];
// Two-column templates often put a "Contact" section first; its lines count as header.
const CONTACT_HEADINGS = ["contact", "contact information", "contact details", "personal details", "personal information"];
const OTHER_HEADINGS = [
  "experience", "work experience", "professional experience", "employment history", "employment",
  "internships", "internship", "internship experience", "education", "academic background",
  "academic qualifications", "qualifications", "skills", "technical skills", "key skills", "core skills",
  "skills summary", "projects", "academic projects", "personal projects", "key projects", "certifications",
  "certificates", "achievements", "awards", "honors", "publications", "activities",
  "extracurricular activities", "extra-curricular activities", "positions of responsibility",
  "leadership", "volunteering", "volunteer experience", "languages", "interests", "hobbies",
  "references", "declaration", "coursework", "relevant coursework", "training", "courses"
];

const MAX_HEADER_LINES = 10;

function headingKind(text) {
  const cleaned = text.toLowerCase().replace(/[\s:|–—-]+$/, "").trim();
  if (SUMMARY_HEADINGS.includes(cleaned)) return "summary";
  if (CONTACT_HEADINGS.includes(cleaned)) return "header";
  if (OTHER_HEADINGS.includes(cleaned)) return "other";
  return null;
}

// Splits a resume into the header block (lines before the first section heading,
// plus any "Contact" section) and the summary/objective text. Inline headings
// like "Objective: Seeking a ..." count too. Everything else is ignored.
export function splitHeaderAndSummary(resumeText) {
  const parts = { header: [], summary: [], other: [] };
  let current = "header";

  for (const rawLine of (resumeText || "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    let kind = headingKind(line);
    let rest = "";
    if (!kind) {
      const inline = line.match(/^([A-Za-z][A-Za-z -]{1,30}?)\s*[:–—]\s*(.+)$/);
      if (inline && headingKind(inline[1])) {
        kind = headingKind(inline[1]);
        rest = inline[2];
      }
    }

    if (kind) {
      current = kind;
      if (rest) parts[current].push(rest);
      continue;
    }

    if (current !== "header" || parts.header.length < MAX_HEADER_LINES) parts[current].push(line);
  }

  return { header: parts.header.join("\n"), summary: parts.summary.join("\n") };
}

const TITLE_CASE_FIXES = [[/\bUi\/Ux\b/, "UI/UX"], [/\bUx\b/, "UX"], [/\bUi\b/, "UI"], [/\bQa\b/, "QA"], [/\bMl\b/, "ML"], [/\bDba\b/, "DBA"], [/\bIos\b/, "iOS"]];

function toTitleCase(text) {
  let out = text.replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  for (const [re, fixed] of TITLE_CASE_FIXES) out = out.replace(re, fixed);
  return out;
}

// Known job titles found in the header (e.g. the line under the name) or the
// summary/objective, in order of first mention. Titles mentioned elsewhere
// ("worked with the product manager" in a project) are ignored.
function findRoleTitles(resumeText) {
  const { header, summary } = splitHeaderAndSummary(resumeText);
  const text = `${header}\n${summary}`;

  const hits = [];
  for (const { title, regex } of TITLE_REGEXES) {
    const m = text.match(regex);
    if (m) hits.push({ title, index: m.index });
  }
  hits.sort((a, b) => a.index - b.index || b.title.length - a.title.length);

  const found = [];
  for (const { title } of hits) {
    if (!found.some(f => f.includes(title) || title.includes(f))) found.push(title);
    if (found.length >= 3) break;
  }

  return found.map(toTitleCase);
}

// A known city named in the header/contact block, or null. Body text (project
// descriptions etc.) is never used, so "location if a crash is detected" can't leak in.
function findLocation(resumeText) {
  const { header } = splitHeaderAndSummary(resumeText);
  let best = null;
  for (const regex of CITY_REGEXES) {
    const m = header.match(regex);
    if (m && (!best || m.index < best.index)) best = { index: m.index, text: m[0] };
  }
  return best ? toTitleCase(best.text) : null;
}

function detectWorkExperience(resumeText) {
  const hasDatedRole = /(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|Present|present)/.test(resumeText);
  const hasExperienceHeading = /(?:work\s+experience|employment\s+history|professional\s+experience|career\s+history)/i.test(resumeText);
  return hasDatedRole && hasExperienceHeading;
}

// Deterministic extraction of role, top skills, and location from resume
// text — used to pre-fill the job search form and as context for AI prompts.
// No network/AI calls. roleTitles is empty and location is null when the
// resume doesn't state them clearly; callers should leave those fields blank.
export function extractResumeProfile(resumeText) {
  if (!resumeText || resumeText.trim().length === 0) {
    return { roleTitles: [], topSkills: [], location: null, hasWorkExperience: false };
  }

  const skillsMap = extractKeywords(resumeText);
  const topSkills = Array.from(skillsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([skill]) => skill);

  return {
    roleTitles: findRoleTitles(resumeText),
    topSkills,
    location: findLocation(resumeText),
    hasWorkExperience: detectWorkExperience(resumeText)
  };
}
