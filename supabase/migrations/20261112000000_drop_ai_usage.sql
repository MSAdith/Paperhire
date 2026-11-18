-- Paperhire: the per-user daily AI limit was removed. This drops its table and
-- function if an earlier version of 20261111000000_tracker_feedback_usage.sql
-- created them. Safe to run whether or not they exist.
-- AI usage is still visible on the admin dashboard, from the ai_call rows in
-- the events table.

drop function if exists public.increment_ai_usage(uuid, date);
drop table if exists public.ai_usage;
