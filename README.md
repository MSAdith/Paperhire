# Paperhire – ATS Resume Scorer & Job-Search Toolkit

Paperhire is a deterministic ATS (Applicant Tracking System) resume scoring web application. It parses PDF and DOCX resumes entirely in-memory, evaluates them against 8 objective recruitment criteria, performs keyword gap analysis against target job descriptions, and provides actionable bullet improvements.

After a resume is scored, a tabbed workspace adds five job-search tools that all share a single job description:

| Tab | What it does | Needs |
|---|---|---|
| **Job Matches** | Live vacancies (India by default) ranked by local skill-match %, with missing skills, Apply links, and "Tailor my resume to this job" | `JSEARCH_API_KEY` |
| **Tailor Resume** | Reorders/rephrases your resume for the JD, before/after ATS + JD-match scores, editable preview, DOCX/PDF download | AI key |
| **Cover Letter** | 250–350 word letter in a formal / confident / concise tone, editable, copy + DOCX/PDF | AI key |
| **Interview Prep** | 15–20 grouped questions (technical, project deep-dive, HR) with what interviewers look for and answer pointers from your resume | AI key |
| **Reach Out** | LinkedIn referral note (kept under LinkedIn's 300-character limit, live counter), cold email, follow-up or thank-you, with subject lines for emails; editable, copy, regenerate | AI key |
| **Tracker** | Saved → Applied → Interview → Offer → Rejected board (drag on desktop, status menu on mobile), notes, follow-up dates, one-click "Track this job" from job cards. Stores job details only | Supabase |
| **Skill Gap** | Required vs. preferred missing skills ranked by JD emphasis, free resources, and (with AI) a 1–2 week plan per skill | Comparison: none. Plans: AI key |

Everything except the landing page needs an account: users sign in with Google or an email magic link (Supabase Auth), and every feature endpoint verifies the session on the server. An admin dashboard at `/admin` shows visits, sign-ups, feature usage and AI health for emails listed in `ADMIN_EMAILS`. Resumes, job descriptions and AI output are still never stored.

"AI key" means the key for the provider chosen by `AI_PROVIDER` (CometAPI by default; Google Gemini and Anthropic also supported). Every key is optional. A feature whose key is missing shows a "not configured" note, and the ATS scorer and every other feature keep working.

---

## 🎨 Design System: Paper & Ink with colour blocks

Light, editorial, slightly playful. All tokens live in `client/src/styles/theme.css`:
- **Paper** `#F6F4EF` (page), **White** `#FFFFFF` (raised surfaces), **Ink** `#121212` (text, borders, primary buttons), **Grey** `#6B6B6B` (secondary text), **Line** `#E2DED5` (dividers)
- Flat colour blocks, never gradients: **Cobalt** `#2F5BFF`, **Tomato** `#FF5533`, **Lime** `#C8F169`, **Sun** `#FFD23F`. Scores: high = lime, medium = sun, low = tomato.
- Type: *Bricolage Grotesque* for display, *Instrument Sans* for text, *Instrument Serif* italic for the odd emphasis word. All self-hosted via `@fontsource`.
- 1.5px ink borders, 4–8px corners, one hard 4px ink offset shadow, no blur or glow. The wordmark is "paper" in ink + "hire" in tomato.

---

## ⚡ Quick Start & Setup

### Prerequisites
- Node.js (v18+ recommended)
- npm

### 1. Installation
Run the root setup command to install dependencies across the monorepo:
```bash
npm run setup
```
*(Or install manually in root, `/server`, and `/client`)*

### 2. Configure API keys (optional)
Copy the template and fill in whichever keys you have:
```bash
cp .env.example server/.env
```

| Variable | Used for | Where to get it |
|---|---|---|
| `AI_PROVIDER` | Which AI provider runs the AI features: `cometapi` (default), `gemini`, or `anthropic` | — |
| `AI_MODEL` | Model ID for that provider. Defaults: `gemini-3.6-flash` (CometAPI and Gemini), `claude-sonnet-5-5` (Anthropic) | [CometAPI model list](https://api.cometapi.com/api/models), [Gemini models](https://aistudio.google.com/docs/models) |
| `COMETAPI_KEY` | AI features when `AI_PROVIDER=cometapi` | [cometapi.com](https://www.cometapi.com/) |
| `GEMINI_API_KEY` | AI features when `AI_PROVIDER=gemini` (Google's free tier works) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `ANTHROPIC_API_KEY` | AI features when `AI_PROVIDER=anthropic` | [console.anthropic.com](https://console.anthropic.com/) |
| `SUPABASE_URL` | Sign-in and analytics. Your Supabase project URL | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | Sign-in in the browser. Public by design; the browser fetches it from `/api/config` | Supabase → Project Settings → API (anon / publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Verifies sessions, writes analytics events, reads the admin dashboard. Never sent to the browser | Supabase → Project Settings → API (service_role / secret key) |
| `ADMIN_EMAILS` | Comma-separated emails allowed into `/admin` (checked on the server) | — |
| `JSEARCH_API_KEY` | Job Matches tab | Subscribe to [JSearch on RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) (free tier ≈ 200 requests/month), then copy your `X-RapidAPI-Key` |

AI features covered: AI bullet rewrites on the ATS report, Tailor Resume, Cover Letter, Interview Prep and Skill-Gap plans. Only the key for the selected provider is needed. To switch to Google's own free tier later, set `AI_PROVIDER=gemini` and `GEMINI_API_KEY`; nothing else changes.

The server reads `server/.env` and, as a fallback, a `.env` in the repo root, by absolute path, so it works no matter which folder you start it from. `server/.env` wins if both set the same key, and neither overrides variables already set by the host (e.g. Vercel). At startup it logs which files it loaded and which key **names** it found (never the values), e.g.:

```
[env] .env files loaded: ..\.env
[env] keys found: AI_PROVIDER, COMETAPI_KEY, JSEARCH_API_KEY; missing: AI_MODEL, GEMINI_API_KEY, ANTHROPIC_API_KEY
[env] AI provider: cometapi (model gemini-3.6-flash, COMETAPI_KEY found)
```

Keys are only ever read on the server and are never sent to the browser bundle. The browser gets exactly two values from `GET /api/config`: the Supabase URL and the anon key, which are public by design. A test checks that the service-role key never appears in that response.

Without `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, every feature endpoint answers **503** ("sign-in isn't configured"). It never falls back to open access, so set up Supabase (below) before running locally.

`JSEARCH_API_KEY` must be a RapidAPI key that is **subscribed** to JSearch (the free Basic plan is enough). A key without the subscription gets "You are not subscribed to this API" (HTTP 403), which the Job Matches tab explains.

### 3. Run Development Server
Start both the Express backend (`http://localhost:5000`) and the React + Vite frontend (`http://localhost:5173`) concurrently:
```bash
npm run dev
```

Open `http://localhost:5173` in your browser to view the application.

---

## 🚀 Deploying to Vercel

`vercel.json` already routes every `/api/*` request to the single Express app in `server/index.js` (via `api/index.js`), so all endpoints work the same locally and on Vercel.

To add the API keys on Vercel:
1. Open your project → **Settings** → **Environment Variables**.
2. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `AI_PROVIDER` (e.g. `cometapi`), the matching key (e.g. `COMETAPI_KEY`), optionally `AI_MODEL`, and `JSEARCH_API_KEY`, ticking **Production** (and **Preview** if you want them on preview deploys).
3. Redeploy. Environment variables only apply to deployments made after they're added.

Or with the CLI: `vercel env add COMETAPI_KEY production` (and the same for `AI_PROVIDER`), then `vercel --prod`.

Notes:
- Functions are allowed up to 60s (`maxDuration` in `vercel.json`), because generating interview questions or a tailored resume can take 20–45s. That limit is available on the Hobby plan.
- `vercel.json` explicitly includes pdfkit's font files (`includeFiles`) so PDF downloads work in the serverless bundle.
- Vercel adds `x-vercel-ip-country` / `x-vercel-ip-city` headers, which is where the dashboard's country and city come from. Locally they're empty.
- The JSearch cache and the per-user rate limiters are **in-memory**. On Vercel they only apply within a warm function instance, so they reduce repeat calls but aren't a hard global limit. For a strict quota, back them with a shared store such as Vercel KV/Upstash Redis.

---

## 🧪 Running Tests

```bash
npm test
```

Vitest tests cover sign-in enforcement on every endpoint (read from the app's own route table, so a new unprotected endpoint fails the build), admin-only access, per-user rate limits, that analytics events never contain resume/JD/AI text, the dashboard aggregation, and the 8-category scoring engine plus the deterministic parts of the new features: skill extraction, job match %, JD match %, required/preferred gap ranking, input validation, the no-fabrication skill guardrail, resource-link allowlisting, DOCX/PDF generation, the AI provider layer (provider/model selection from `.env`, each SDK adapter's request shape, JSON parsing, 429 retry, credits/auth/timeout handling), and route-level tests that mock only the AI call.

---

## 🔐 Sign-in, analytics & admin

### Set up Supabase (once)
1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. **Run the migrations, in order**, each in Dashboard → **SQL Editor** → **New query** → paste the whole file → **Run**:
   1. `supabase/migrations/20261110000000_paperhire_events.sql`: the `events` table (analytics), indexes, and row-level security with no policies, so only the server's service role can read or write it.
   2. `supabase/migrations/20261111000000_tracker_feedback_usage.sql`: `applications` (tracker; RLS policies let a user touch only rows where `user_id = auth.uid()`), and `ai_feedback` (RLS on, server-only).
   3. `supabase/migrations/20261112000000_drop_ai_usage.sql`: removes the old daily-limit table and function if an earlier version of migration 2 created them (harmless otherwise).

   Both are safe to re-run. With the Supabase CLI instead: `supabase link --project-ref <ref>` then `supabase db push`.
3. **Auth → URL Configuration**: set *Site URL* to your production URL (e.g. `https://paperhire.vercel.app`) and add redirect URLs `http://localhost:5173/**` and `https://<your-domain>/**` (plus `https://*-<your-team>.vercel.app/**` for preview deploys).
4. **Auth → Providers → Email**: keep it enabled (magic links). **Auth → Providers → Google**: enable it and paste a Google OAuth client ID and secret. In Google Cloud Console, create an *OAuth client ID* of type *Web application* with the authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Copy the project URL, anon key and service-role key into `server/.env` (and Vercel), and set `ADMIN_EMAILS`.

### How access is enforced
- `apiAuthGate` (`server/middleware/auth.js`) runs before every route. Everything under `/api` (and the old `/analyze` alias) needs a valid Supabase access token in `Authorization: Bearer …`, verified with Supabase on the server (cached for 60s). Only `/api/health`, `/api/config` and `/api/events/page-view` are public. Unknown or future endpoints are denied by default.
- `/api/admin/*` additionally requires the signed-in email to be in `ADMIN_EMAILS` (403 otherwise). The `/admin` page shows a not-found page to everyone else.
- Rate limits are per user (per IP only for the public page-view endpoint).

### Tracker and feedback
- **Tracker** (`/api/tracker`, also at `/tracker` and as a workspace tab): every read and write runs on the server and is scoped to the signed-in user's id; ids in the request body are ignored, and another user's card answers 404. RLS policies on `applications` enforce the same rule for anything using the public API. Only job metadata is stored: title, company, location, link, status, a note (≤ 500 chars) and a follow-up date.
- **Feedback** (`POST /api/feedback`): thumbs up/down under every AI result. Stores the feature, rating, a reason chip, an optional one-line comment (≤ 300 chars), user id, time, AI provider/model and response time. Never the AI output or the resume; extra fields in the request are ignored.
- **No daily AI cap.** The only limits are the per-minute rate limits (per user), which stop rapid-fire scripts without affecting normal use. AI usage per day and per user is still visible on the admin dashboard, from the `ai_call` events.

### What is tracked
One table, `events`, with: timestamp, type (`page_view`, `sign_up`, `sign_in`, `feature_used`, `ai_call`, `error`), a short label (feature name / AI result / sign-in method), page path, AI duration, route + error type, user id, an anonymous visitor id (`ph_vid` first-party cookie), device, browser, and country/city from Vercel's geo headers. Events are built from a field allowlist with length caps (`server/lib/events.js`), and the database enforces the same caps, so resume text, job descriptions or AI output can't be stored even by mistake. Tracking is fire-and-forget and never slows a request. The privacy page (`/privacy`) explains this to users, and a first-visit notice links to it.

### Admin dashboard (`/admin`)
Visitors (unique, today/7d/30d), users, new sign-ups, DAU/WAU, AI calls per day and top users by AI calls, feedback (👍 rate per feature, most common 👎 reasons, latest comments filterable by feature), visitors and sign-ups per day, feature usage, AI success rate / average time / failures by type, JSearch searches this month vs the ~200 free quota (cached repeats excluded), top countries/cities, devices, browsers, recent errors, and a searchable, sortable users table with CSV export. Filter: 7 days / 30 days / all time. Aggregation happens on the server from the events table (capped at 200k rows per load; move it into SQL if you ever get near that).

---

## 🧠 Scoring Engine Breakdown (Total: 100 Points)

Paperhire evaluates uploaded resumes using an explainable 8-category rule-based engine:

### 1. Keyword Match with Job Description (Weight: 35 points)
- **Methodology**: Tokenizes and normalizes the target Job Description (JD). Matches terms against a built-in skills dictionary of **500+ tech and business competencies** (including canonical name mappings and synonyms, e.g. `JS` $\rightarrow$ `JavaScript`, `K8s` $\rightarrow$ `Kubernetes`).
- **Scoring**: Weighted keyword frequency match ratio. If no JD is provided, evaluates against general industry skill benchmarks.

### 2. Parseability & Formatting (Weight: 20 points)
- **Methodology**: Verifies character extraction. Penalizes scanned image PDFs (<150 extracted characters). Scans for multi-column / tabular spacing artifacts, unreadable wingding icons, and missing body contact text.

### 3. Section Structure (Weight: 10 points)
- **Methodology**: Detects 6 standard ATS section headers: *Summary/Objective, Education, Experience, Projects, Skills, Certifications*.

### 4. Contact Information (Weight: 5 points)
- **Methodology**: Validates presence of Email address, Phone number, and LinkedIn / GitHub / Portfolio URLs using pattern matching.

### 5. Experience Quality & Bullet Impact (Weight: 15 points)
- **Methodology**: Analyzes bullet points for strong action verbs (*Spearheaded, Architected, Optimized, Scaled*) and quantified impact metrics (*percentages, monetary values, user scale*). Penalizes weak passive phrases (*"responsible for", "worked on"*).

### 6. Skills Relevance & Categorization (Weight: 5 points)
- **Methodology**: Checks for an explicit Skills section and assesses whether skills are organized into subcategories (*Languages, Frameworks, Databases, Tools*).

### 7. Length & Readability (Weight: 5 points)
- **Methodology**: Evaluates total word count (ideal: 350–800 words), bullet length (ideal: 10–28 words per bullet), and date formatting consistency.

### 8. Spelling & Grammar (Weight: 5 points)
- **Methodology**: Performs vocabulary scan ignoring proper nouns, numbers, and technical terms in the skills dictionary.

### Optional AI Layer
If an AI key is configured (see `AI_PROVIDER` above), the AI model rewrites the 3 weakest bullet points into high-impact metric-driven statements and generates a 3-line executive summary. *The AI layer operates strictly as an advisory feature and never alters the numeric score.*

---

## 🧰 Job-Search Features: How They Work

### Job Matches (JSearch)
- Role and location are extracted from the resume **deterministically** (`server/scoring/resumeProfile.js`) and pre-fill the search form (`POST /api/jobs/profile`), which the user can edit. To avoid picking up text from project descriptions, the location comes only from a known city name in the contact/header block, and the role only from a known job title in the header (e.g. the line under your name) or the Summary/Objective section. If either isn't clear, the field is left empty: a blank location searches all of India, and a blank role asks you to type one. Fresher resumes (no dated work-experience section) get the entry-level filter ticked by default. Filters: remote only, date posted, entry-level/fresher friendly.
- Requests go to `GET https://jsearch.p.rapidapi.com/search-v2` with `country=in` (the older `/search` endpoint now returns 404). Only the role and location are sent to JSearch, never the resume.
- Each job's match % is computed locally from skill overlap between the resume and the job's description + highlights (`computeMatchPercent` in `server/scoring/jobMatch.js`), and results are sorted by it.
- Identical searches are cached for ~1 hour to protect the free-tier quota.
- Filters map to `date_posted`, `work_from_home=true` (remote only), and `job_requirements=no_experience,under_3_years_experience` (entry-level), all confirmed against the live API, which echoes the parameters it accepted. Only the first page of results (~10 jobs) is fetched.

### No-fabrication rule (Tailor Resume, Cover Letter, Interview Prep)
All prompts include a strict rule: never invent jobs, internships, skills, certifications, metrics, or dates. Resumes with no dated work experience are flagged as fresher resumes, and the prompt forbids claiming experience. As a deterministic backstop, any skill the AI lists that doesn't literally appear in the original resume is removed and shown as a gap instead. That check catches invented skills but can't catch every kind of invention, so the editable preview is still where you review the result.

### Skill Gap
The comparison is fully deterministic: each missing skill is marked **preferred** if every JD sentence mentioning it has a cue like "nice to have" / "a plus", and **required** otherwise, then ranked by how often the JD mentions it. Curated free resources (official docs, freeCodeCamp, NPTEL, etc.) are shown without AI. With AI, each gap also gets a "why it matters" and a 1–2 week plan. AI-suggested links are kept only if they're HTTPS on an allowlisted domain, and YouTube links only if they point to a channel, not an individual video.

### Prompts
All prompts live in `server/prompts/` (one file per feature, plus the shared no-fabrication rule in `shared.js`), so they can be tuned without touching route code. AI responses are requested as strict JSON and validated before use. On a failure or timeout, the route returns a friendly message instead of partial output.

### AI providers
`server/lib/aiConfig.js` reads `AI_PROVIDER` / `AI_MODEL` and the matching key; `server/lib/aiProviders.js` has one small adapter per SDK; `server/lib/aiClient.js` runs the same JSON parsing, validation and retry logic for all of them, so prompts, validators and the no-fabrication filter are identical whichever provider you pick.

| Provider | SDK | Strict JSON |
|---|---|---|
| `cometapi` | `openai` (`chat.completions.create`, base URL `https://api.cometapi.com/v1`) | `response_format: json_object` |
| `gemini` | `@google/genai` (`models.generateContent`) | `responseMimeType: application/json` |
| `anthropic` | `@anthropic-ai/sdk` (`messages.create`) | JSON requested in the prompt |

If a provider or model rejects strict JSON mode (HTTP 400), the call is retried once as a plain request, and the JSON is extracted from the reply text. Errors are mapped to friendly messages:
- **429 rate limit:** one retry after 2 seconds, then "AI is busy, try again in a minute."
- **402 / insufficient credits or quota:** no retry; "AI credits used up."
- **Bad API key:** logged on the server with the name of the key to check; users see the feature's generic failure message.

Gemini 3 models spend "thinking" tokens before answering, so Gemini requests get extra output-token headroom (and `thinkingLevel: LOW` on Google's API) to keep JSON from being cut off.

### API endpoints

All of these need `Authorization: Bearer <Supabase access token>`; without it they return 401.

| Method & path | Body |
|---|---|
| `POST /api/analyze` | multipart: `resume` file, optional `jd`. Response now includes `resumeText`. |
| `POST /api/jobs/profile` | `resumeText` → `{ role, location, isFresher }` search-form defaults (`""` when unsure) |
| `POST /api/jobs/search` | `resumeText`, `role` (required unless the resume states one), optional `location`, `remoteOnly`, `datePosted` (`all`/`today`/`3days`/`week`/`month`), `fresherFriendly` |
| `POST /api/tailor` | `resumeText`, `jdText` |
| `POST /api/tailor/download` | `tailored` (edited JSON), `format` (`docx`/`pdf`), optional `resumeText` for the name |
| `POST /api/cover-letter` | `resumeText`, `jdText`, `tone` (`formal`/`confident`/`concise`), optional `companyName`, `roleTitle` |
| `POST /api/cover-letter/download` | `letter`, `format` |
| `POST /api/interview-prep` | `resumeText`, `jdText` |
| `POST /api/skill-gap` | `resumeText`, `jdText` |
| `POST /api/reach-out` | `resumeText`, `jdText`, `companyName`, `messageType` (`linkedin_referral`/`cold_email`/`follow_up`/`thank_you`), optional `recipientName`, `recipientRole`, `tone` (`friendly`/`formal`) |
| `GET /api/tracker`, `POST /api/tracker`, `PATCH /api/tracker/:id`, `DELETE /api/tracker/:id` | job metadata: `title`, `company`, `location`, `jobUrl`, `status`, `note`, `followUpDate`, `externalId` |
| `POST /api/feedback` | `feature`, `rating` (`up`/`down`), optional `reason`, `comment`, `responseMs` |
| `POST /api/events/auth` | none; records `sign_up` / `sign_in` for the signed-in user |
| `GET /api/admin/me`, `GET /api/admin/summary?range=7d\|30d\|all` | admin only (`ADMIN_EMAILS`) |
| `GET /api/config` (public) | returns the Supabase URL + anon key |
| `POST /api/events/page-view` (public) | `{ path }` |

Limits: resume text ≤ 20,000 chars, JD ≤ 8,000 chars, short fields ≤ 200 chars. Per-user rate limits: 20/min for analyze, 10/min for job search and skill gap, 8/min for each AI generation endpoint.

---

## 🔒 Privacy & Security

Files uploaded to Paperhire are parsed in-memory using `multer.memoryStorage()`, `pdf-parse`, and `mammoth`. Resumes are **never written to disk, cached, or stored** in any database. The extracted text is returned to your browser, which sends it back with each feature request, so the server holds no session state.

AI features are processed by a third-party AI provider: when one is used, the resume and job description text are sent to the provider chosen by `AI_PROVIDER` (CometAPI by default, which forwards to the model's vendor, e.g. Google for Gemini models) to generate that output. The site shows this note on the upload page and above the workspace tabs. Job search sends only the role and location to JSearch. The server caches job-search results, never resume content.

The tracker stores job details you add (never resumes or JDs), and feedback stores your rating plus an optional short comment (never the AI output). Accounts are handled by Supabase Auth (email, plus name and avatar for Google sign-ins). Analytics events contain only metadata (see *What is tracked* above). The Supabase service-role key stays on the server; the browser only ever gets the anon key.

---

## 📁 Repository Structure

```
paperhire/
├── package.json               # Root monorepo orchestration
├── .env.example               # Environment variables template
├── README.md                  # System documentation
├── sample-resumes/            # Sample PDF & DOCX test files
├── vercel.json                # Vercel routing, function limits
├── supabase/migrations/       # SQL: events (analytics); applications, ai_feedback + RLS
├── api/                       # Vercel serverless entry points (forward to server/index.js)
├── server/
│   ├── index.js               # Loads .env, logs config, listens locally
│   ├── app.js                 # Express app: auth gate, analytics, analyze endpoint, routers
│   ├── routes/                # jobs, tailor, coverLetter, interviewPrep, skillGap, reachOut, tracker, feedback, platform (config, events, admin)
│   ├── services/jsearch.js    # JSearch client + 1h cache
│   ├── prompts/               # All AI prompts, response validators, curated resources
│   ├── docgen/                # DOCX (docx) and PDF (pdfkit) generation
│   ├── lib/                   # AI provider layer, TTL cache, supabase (server client), events, adminStats/adminData, stores (tracker/feedback)
│   ├── middleware/            # auth gate, per-user rate limiter, feature tracking, input validation
│   ├── scoring/               # 8 ATS categories, skills dictionary, job/JD matching, resume profile
│   └── tests/                 # Vitest suites
└── client/
    ├── vite.config.js         # Vite configuration with API proxy
    ├── index.html             # HTML shell & font imports
    └── src/
        ├── index.css          # Paper & Ink design tokens & print stylesheet
        ├── App.jsx            # App controller; holds the shared JD + selected job
        ├── lib/               # api (auth-aware fetch), auth (Supabase session), analytics, router, toast
        └── components/        # Workspace tabs, feature panels, SignInPage, AdminPage + charts, PrivacyPage
```
