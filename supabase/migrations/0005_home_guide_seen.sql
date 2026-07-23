-- =====================================================================
-- DayTickles — migration: Home guide seen flag
-- Confirmed missing live via direct anon-key probe (42703) before
-- writing this — home_guide_seen did not exist on profiles, unlike
-- most fields checked earlier this session. Gates the first-run
-- multi-step Home guide (Smile Streak/stats, New Tickle/mood picker,
-- Feed tabs/liking, goal-tagging/notifications) so it only auto-shows
-- once; the same guide is reachable anytime, ungated, via a link in
-- Settings.
-- =====================================================================

alter table public.profiles
  add column if not exists home_guide_seen boolean not null default false;

comment on column public.profiles.home_guide_seen is
  'Whether the person has been auto-shown the first-run Home guide. The guide itself stays reachable on demand from Settings regardless of this flag.';
