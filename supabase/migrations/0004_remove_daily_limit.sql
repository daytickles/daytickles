-- =====================================================================
-- DayTickles — migration: Remove the one-entry-per-day limit
-- Reverses the `unique (user_id, entry_date)` constraint from 0001.
-- A hard daily cap can work against the app's actual purpose for
-- people using it around anxiety/stress/outlook — someone having a
-- hard day who notices several good things shouldn't be blocked from
-- logging all of them. See daytickles-spec.md Concept section for the
-- fuller rationale.
--
-- The smile-streak calculation is unaffected: it only checks whether
-- at least one entry exists for a given day, never how many, so
-- allowing multiple entries per day doesn't change streak behavior.
-- =====================================================================

alter table public.tickle_entries
  drop constraint if exists tickle_entries_user_id_entry_date_key;
