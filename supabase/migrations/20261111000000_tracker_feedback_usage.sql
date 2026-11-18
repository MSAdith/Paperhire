-- Paperhire: application tracker and AI feedback.
-- Run after 20261110000000_paperhire_events.sql.
--
-- None of these tables hold resume text, job descriptions or AI output.
-- The app's server reads and writes them with the service-role key, scoping
-- every tracker query to the signed-in user. Row-level security is ON for both
-- as a second line of defence for anything using the public API.

-- ---------------------------------------------------------------------------
-- 1. Application tracker: job metadata only.
-- ---------------------------------------------------------------------------
create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 200),
  company         text not null check (char_length(company) between 1 and 200),
  location        text check (char_length(location) <= 200),
  job_url         text check (char_length(job_url) <= 1000 and job_url ~* '^https?://'),
  status          text not null default 'saved'
                  check (status in ('saved', 'applied', 'interview', 'offer', 'rejected')),
  note            text check (char_length(note) <= 500),
  follow_up_date  date,
  external_job_id text check (char_length(external_job_id) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists applications_user_created_idx on public.applications (user_id, created_at desc);
-- One tracker card per listing per user ("Track this job" twice doesn't duplicate).
create unique index if not exists applications_user_external_idx
  on public.applications (user_id, external_job_id) where external_job_id is not null;

alter table public.applications enable row level security;

-- Signed-in users may only ever touch their own rows (if the public API is used).
drop policy if exists "applications_select_own" on public.applications;
create policy "applications_select_own" on public.applications
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "applications_insert_own" on public.applications;
create policy "applications_insert_own" on public.applications
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "applications_update_own" on public.applications;
create policy "applications_update_own" on public.applications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "applications_delete_own" on public.applications;
create policy "applications_delete_own" on public.applications
  for delete to authenticated using (auth.uid() = user_id);

revoke all on table public.applications from anon;

-- ---------------------------------------------------------------------------
-- 2. AI feedback: rating, reason and a short comment. Never the AI output.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null,
  feature     text not null check (feature in ('tailor', 'cover_letter', 'interview_prep', 'skill_gap', 'reach_out')),
  rating      text not null check (rating in ('up', 'down')),
  reason      text check (reason in ('made_things_up', 'too_generic', 'wrong_tone', 'bad_formatting', 'other')),
  comment     text check (char_length(comment) <= 300),
  provider    text check (char_length(provider) <= 20),
  model       text check (char_length(model) <= 60),
  response_ms integer check (response_ms between 0 and 600000)
);

create index if not exists ai_feedback_created_idx on public.ai_feedback (created_at);
create index if not exists ai_feedback_feature_created_idx on public.ai_feedback (feature, created_at);

alter table public.ai_feedback enable row level security;
-- No policies: only the server (service role) reads or writes feedback.
revoke all on table public.ai_feedback from anon, authenticated;
