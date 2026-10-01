-- =====================================================================
-- DayTickles — migration: confirm v1 Founding Member dead-code removal
--
-- try_award_founding_member(), record_founding_activity(), and
-- founding_activity_days were already dropped by migration 0022
-- (founding_member_v2.sql), which replaced the unused v1 design
-- (first-25-globally/14-day window) with the live 6-month checkpoint
-- system. Re-verified 2026-08-14: zero references anywhere in app/,
-- components/, lib/, or any other migration; no trigger, view, or
-- function in the current schema depends on any of the three.
--
-- This migration is a deliberate no-op safety net, not new cleanup --
-- every statement uses IF EXISTS, so it succeeds identically whether
-- 0022 was actually applied to the live database or not. Since this
-- project has no linked Supabase CLI (every migration is applied by
-- hand through the dashboard), running this closes any doubt without
-- depending on trusting migration history alone.
--
-- CONFIRMED APPLIED: run by hand via the Supabase dashboard SQL Editor,
-- 2026-08-14 ("Success. No rows returned"). v1 Founding Member dead
-- code is now verified fully gone from the live database, not just
-- from this repo's migration history.
-- =====================================================================

drop function if exists public.record_founding_activity(uuid, text);
drop function if exists public.try_award_founding_member(uuid);
drop table if exists public.founding_activity_days;
