-- Paperhire analytics: one append-only "events" table.
--
-- What is stored: event type, a short label (feature name / AI result /
-- sign-in method), page path, duration, route + error type, user id, an
-- anonymous visitor id, device, browser, country and city.
-- What is never stored: resume text or files, job descriptions, AI output.
-- The CHECK constraints below cap every text column at a short length, so
-- even a bug in the app couldn't write a resume or JD into this table.
--
-- Access: row-level security is ON with no policies, and all privileges are
-- revoked from the anon and authenticated roles. Signed-in users therefore
-- can't read or write events (theirs or anyone else's) through the public API.
-- Only the server, using the service-role key, can insert and read.
-- User accounts live in Supabase's own auth.users table, which is not exposed
-- through the public API; the admin dashboard reads it with the service role.

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  type        text not null
              check (type in ('page_view', 'sign_up', 'sign_in', 'feature_used', 'ai_call', 'error')),
  name        text check (char_length(name) <= 40),
  path        text check (char_length(path) <= 120),
  result      text check (char_length(result) <= 20),
  duration_ms integer check (duration_ms between 0 and 600000),
  route       text check (char_length(route) <= 80),
  error_type  text check (char_length(error_type) <= 60),
  user_id     uuid references auth.users (id) on delete set null,
  visitor_id  text check (char_length(visitor_id) <= 64),
  device      text check (char_length(device) <= 20),
  browser     text check (char_length(browser) <= 30),
  country     text check (char_length(country) <= 4),
  city        text check (char_length(city) <= 60)
);

create index if not exists events_created_at_idx on public.events (created_at);
create index if not exists events_type_created_at_idx on public.events (type, created_at);
create index if not exists events_user_id_idx on public.events (user_id, created_at desc) where user_id is not null;
create index if not exists events_visitor_id_idx on public.events (visitor_id) where visitor_id is not null;

alter table public.events enable row level security;

-- No RLS policies on purpose: with RLS on and no policy, anon and
-- authenticated requests see zero rows and can't insert. Revoking the
-- privileges as well makes that explicit.
revoke all on table public.events from anon, authenticated;
revoke all on sequence public.events_id_seq from anon, authenticated;
