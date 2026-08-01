-- =====================================================================
-- DayTickles — migration: Rate-Us milestone prompt seen flag
-- Backlog #8: a one-time, dismissible Home banner shown once someone
-- hits 10 saved tickles, asking for a rating via the same native
-- expo-store-review flow the Settings "Rate Us" button already uses.
-- Same shape as home_guide_seen (0005): flips true the moment the
-- banner is SHOWN, not only on explicit dismiss — so ignoring it never
-- brings it back. No nag, ever.
-- =====================================================================

alter table public.profiles
  add column if not exists rate_prompt_seen boolean not null default false;

comment on column public.profiles.rate_prompt_seen is
  'Whether the milestone Rate-Us banner has been shown (set true the moment it is shown, not only on dismiss). Never re-shown once true.';
