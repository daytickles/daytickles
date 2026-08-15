-- =====================================================================
-- DayTickles — require tickle_nature on new entries.
--
-- Backs up create.js's client-side check (entryId-gated, create only --
-- edits of pre-existing untagged entries are deliberately not blocked).
-- No backfill attempted: only test accounts exist pre-launch, all to be
-- deleted before real users arrive, so any existing null rows are
-- cleaned up as test-data hygiene rather than migrated.
-- =====================================================================
alter table public.tickle_entries
  alter column tickle_nature set not null;
