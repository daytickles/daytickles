-- =====================================================================
-- DayTickles — migration: day_journal_enabled toggle
-- Day Journal gets its own independent opt-in toggle, separate from
-- tickle_nature_enabled — the two features are gated independently even
-- though 'day_journal' lives as a 4th value in the same tickle_nature
-- field (see 0010). Same plain-boolean, off-by-default pattern as
-- tickle_nature_enabled / home_guide_seen.
-- =====================================================================

alter table public.profiles
  add column if not exists day_journal_enabled boolean not null default false;

comment on column public.profiles.day_journal_enabled is
  'Settings toggle controlling whether the Day Journal feature (tickle_nature = day_journal) is shown at all for this person. Off by default — opt-in, independent of tickle_nature_enabled.';
