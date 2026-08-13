-- =====================================================================
-- Daily per-vibe goals — Home Vibes redesign, Stage 1.
--
-- Three independently-configurable daily targets, one per
-- tickle_nature value (received/given/self — see lib/theme.js's
-- NATURE_ORDER for the canonical ordering). Nullable, default null:
-- null means "no goal set for this vibe" — the lightbulb for that vibe
-- simply never lights until the person opts in via Settings, matching
-- the spec's low-pressure framing (nothing is on by default).
--
-- Deliberately does NOT add anything for the separate weekly goal-line
-- concept (for the not-yet-built Vibes rhythm chart on Weekly Summary)
-- — that's scoped and deferred separately per
-- DayTickles_Home_Vibes_Redesign_Spec_v1.md.
-- =====================================================================
alter table public.profiles
  add column daily_goal_received integer check (daily_goal_received is null or daily_goal_received >= 1),
  add column daily_goal_given    integer check (daily_goal_given    is null or daily_goal_given    >= 1),
  add column daily_goal_self     integer check (daily_goal_self     is null or daily_goal_self     >= 1);
