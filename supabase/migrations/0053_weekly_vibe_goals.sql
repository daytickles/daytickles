-- =====================================================================
-- Weekly per-vibe goals — second, independent goal mechanic alongside
-- the existing daily_goal_* columns (migration 0033).
--
-- NOT the same as the "weekly goal-line" concept scoped (but never
-- built) in DayTickles_Home_Vibes_Redesign_Spec_v1.md for a future
-- Vibes rhythm chart on Weekly Summary -- that remains a separate,
-- still-deferred, chart-based idea. This is a distinct, new mechanic:
-- a second lightbulb per Vibe card on Home, comparing the vibe's
-- already-computed WEEK count against its own independent weekly
-- target -- same on/off (not tiered) mechanic as the daily bulb, just
-- a longer window. See app/(tabs)/home.js's isVibeLitWeekly.
--
-- Same shape as migration 0033's daily_goal_* columns: nullable,
-- default null ("no goal set" -- that vibe's weekly bulb never
-- lights), integer >= 1 when set.
-- =====================================================================
alter table public.profiles
  add column weekly_goal_received integer check (weekly_goal_received is null or weekly_goal_received >= 1),
  add column weekly_goal_given    integer check (weekly_goal_given    is null or weekly_goal_given    >= 1),
  add column weekly_goal_self     integer check (weekly_goal_self     is null or weekly_goal_self     >= 1);
