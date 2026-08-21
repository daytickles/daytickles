-- =====================================================================
-- DayTickles — drop orphaned pinned_entries view, then tickle_entries.mood
--
-- The mood-intensity picker (create.js) and every mood-dot render site
-- (EntryCard.js/home.js/weekly-summary.js) were removed in favor of the
-- vibe icon (VIBE_COLORS/NatureIcon) as the entry's visual identifier --
-- see lib/theme.js's removal of MOODS/moodColorFor/moodBorderColor/
-- MOOD_DOT_SIZE/MOOD_MOTION and moodBase from ACCENT_THEMES, same pass.
-- create.js no longer collects a real value from the user; it was left
-- writing a fixed 'good' default (and edit mode round-tripping whatever
-- was already stored) only until this column's fate was decided.
--
-- A first attempt at just the column drop failed: pinned_entries
-- (migration 0001) is a `select *` view, which silently pulled in a
-- dependency on every tickle_entries column, mood included. That view
-- was meant to back Home's "most smiled with you" card server-side,
-- but that's not what ships today -- home.js computes it entirely
-- client-side (a reduce() over entries already fetched by
-- loadEntries(), same PINNED_WINDOW_DAYS=14 window, independently
-- reimplemented). Confirmed 2026-08-21: zero references to
-- pinned_entries anywhere in app/, components/, or lib/, and a live
-- pg_depend/pg_policies/pg_proc check against the actual database (not
-- just the repo's tracked migration history) confirmed nothing else --
-- no other view, no RLS policy, no function body -- depends on it
-- either. Genuinely orphaned.
--
-- Dropped explicitly by name here (not via CASCADE off the column
-- drop) so exactly one thing is removed and it's auditable in this
-- file, rather than trusting CASCADE to only take out what was already
-- verified clean.
--
-- Safe to drop mood outright, not just nullify: also checked before
-- removing the client-side mood picker that no external consumer
-- (Edge Function, other service) reads this column -- the only
-- candidate considered (a speculative share-preview Edge Function) was
-- confirmed never actually built, just a comment describing a future
-- idea. No other code in app/, components/, or lib/ references
-- entry.mood after the five-file cleanup above.
--
-- CONFIRMED APPLIED: run by hand via the Supabase dashboard SQL Editor,
-- 2026-08-21 ("Success. No rows returned."). pinned_entries and
-- tickle_entries.mood are now both gone from the live database, not
-- just from this migration file.
-- =====================================================================

drop view public.pinned_entries;

alter table public.tickle_entries
  drop column mood;
