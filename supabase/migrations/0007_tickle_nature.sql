-- =====================================================================
-- DayTickles — migration: tickle nature tagging (opt-in)
-- Confirmed missing live via direct anon-key probe (42703, checked
-- against both tickle_entries and profiles) before writing this, same
-- as every other field checked this session. Lets a person optionally
-- tag a tickle with what kind of positivity it was.
-- =====================================================================

alter table public.tickle_entries
  add column if not exists tickle_nature text
    check (tickle_nature in ('received', 'given', 'self'));

comment on column public.tickle_entries.tickle_nature is
  'Optional tag for what kind of positivity this tickle was. received = something made me smile; given = paying forward, did something for someone else; self = self-care, did it for me. Nullable — tagging is optional per-entry, same pattern as goal_id.';

alter table public.profiles
  add column if not exists tickle_nature_enabled boolean not null default false;

comment on column public.profiles.tickle_nature_enabled is
  'Settings toggle controlling whether the tickle_nature tagging feature is shown at all for this person. Off by default — opt-in, not a default-on addition.';
