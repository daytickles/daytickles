-- =====================================================================
-- DayTickles — migration: entry-edited flag
-- Confirmed missing live via direct anon-key probe (42703) before
-- writing this, same as every other field checked this session.
--
-- create.js is gaining edit-mode support: editing an existing entry
-- updates text_content/mood/tickle_nature/visibility in place, without
-- touching entry_date (the original date is preserved on purpose). That
-- means there's no other signal anywhere in the schema for "this entry
-- was edited after it was first posted" — no updated_at on
-- tickle_entries at all. is_edited is the minimal flag needed to show a
-- small "(edited)" label on public entries after a successful edit,
-- same plain-boolean pattern as home_guide_seen / daily_reminder.
-- =====================================================================

alter table public.tickle_entries
  add column if not exists is_edited boolean not null default false;

comment on column public.tickle_entries.is_edited is
  'Set true when an entry is updated via edit mode in create.js. Surfaces as an "(edited)" label on public entries only — never reset back to false.';
