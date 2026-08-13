-- =====================================================================
-- Weekly rhythm goal-line — Home Vibes redesign, Stage 2.
--
-- The overall daily target (any vibe type combined) drawn as a dashed
-- goal line across Weekly Summary's rhythm chart. Deliberately a
-- SEPARATE column from daily_goal_received/given/self (migration
-- 0033) -- those are three independent per-vibe daily targets behind
-- Home's lightbulbs; this is one combined per-day target visualized
-- across the week. Named daily_total_goal, not weekly_*, because the
-- value itself is a per-day count (a "total tickles today, any vibe"
-- target) even though it's configured and displayed in a weekly
-- context -- the name describes what the number IS, not where it's
-- shown.
--
-- Nullable, default null: null means "not configured" -- the goal line
-- simply doesn't render until the person opts in via Settings, same
-- off-by-default, low-pressure pattern as 0033's three columns.
-- =====================================================================
alter table public.profiles
  add column daily_total_goal integer check (daily_total_goal is null or daily_total_goal >= 1);
