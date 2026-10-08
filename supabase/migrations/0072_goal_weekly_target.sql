-- =====================================================================
-- DayTickles — migration: optional weekly target per Goal
-- Adds goals.weekly_target. Null = no target (today's behaviour: plain
-- count on Home, no circle). Same nullable ">= 1 or null" shape as
-- profiles.weekly_goal_<vibe> (0053). "Target reached" is derived on
-- the client from this week's tagged-entry count (entry_date, local
-- week per profiles.week_start_day) and is never stored. Reaching it
-- earns nothing (tokens stay per-tag via award_token_on_goal_tag,
-- 0065) and missing it shows nothing.
--
-- Additive and nullable with no default: a metadata-only change, no
-- table rewrite. Older app builds never send this column (their goals
-- inserts/updates are partial objects), so they can't overwrite it.
-- No RLS change needed: goals' existing FOR ALL owner policy (0002)
-- already covers every column.
-- =====================================================================
alter table public.goals
  add column if not exists weekly_target integer
    check (weekly_target is null or weekly_target >= 1);

comment on column public.goals.weekly_target is
  'Optional weekly target. Null = off. Reached-state is derived client-side from this week''s tagged entries (entry_date), never stored.';
