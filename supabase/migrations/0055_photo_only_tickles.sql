-- =====================================================================
-- DayTickles — Photo-Only Tickle type (Part 1 of the feature: schema)
--
-- Adds the minimum needed to let a Tickle exist with no text at all,
-- tagged with a type flag and a display-only filename hint for the
-- Relink flow. See DayTickles_Photo_Only_Tickle_Spec.md and the
-- pre-diff audit (2026-09-03) for full context.
--
-- Deliberately NOT touched here:
--   - the char_length(text_content) check constraint: it already
--     no-ops on NULL, so dropping NOT NULL alone is sufficient.
--   - media_url: already exists on this table (unused until now) and
--     is reused as-is as the "made public + uploaded" signal — null
--     means private/local-only, populated means public/uploaded.
--   - pinBoardDb.js's local SQLite schema: a photo-only entry's link
--     to its photo reuses the existing photo_entry_links table, the
--     same mechanism the "pin a photo to a written Tickle" flow
--     already uses. No new local reference column needed.
--   - RLS: existing tickle_entries policies already apply uniformly
--     regardless of entry_kind.
--
-- CONFIRMED APPLIED: run by hand via the Supabase dashboard SQL Editor,
-- 2026-09-03. entry_kind, local_photo_filename, and the nullable
-- text_content are live on the database, not just in this file.
-- =====================================================================

alter table public.tickle_entries
  alter column text_content drop not null;

alter table public.tickle_entries
  add column entry_kind text not null default 'text'
    check (entry_kind in ('text', 'photo_only'));

alter table public.tickle_entries
  add column local_photo_filename text;

comment on column public.tickle_entries.entry_kind is
  'Discriminates a normal written Tickle from a photo-only Tickle. Defaults to text so every pre-existing row is unaffected.';
comment on column public.tickle_entries.local_photo_filename is
  'Display-only hint for the "photo missing / Relink" placeholder -- the original filename, not a functional reference. The actual local file lives in the per-device pinboard SQLite DB (pinned_photos.file_path), linked via photo_entry_links.';
