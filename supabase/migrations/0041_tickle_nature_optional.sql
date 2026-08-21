-- =====================================================================
-- DayTickles — allow tickle_nature to be null again (reverses 0039)
--
-- New feature: a Tickle can now be saved with no vibe selected at all --
-- genuinely null tickle_nature, not a choice among the existing four
-- options (received/given/self/day_journal). This reverses migration
-- 0039's NOT NULL constraint, added when vibe selection became
-- mandatory on create -- that requirement no longer holds.
--
-- Verified before this migration (create.js's client-side gate removed
-- in the same pass): Home's vibe tallies (vibeWeekCounts/vibeMonthCounts/
-- vibeAllTimeCounts/vibeTodayCounts) already skip a falsy tickle_nature
-- via their own `if (!nature || ...) continue` guard, so a null-vibe
-- entry naturally doesn't count toward any of the three vibe stats.
-- Home's and Weekly Summary's "Tickles, all-time"/weekly count stats
-- (entries.length / weekEntries.length) are already unfiltered by
-- tickle_nature, so a null-vibe entry is already correctly counted
-- there too. No other code change required for either requirement.
--
-- CONFIRMED APPLIED: run by hand via the Supabase dashboard SQL Editor,
-- 2026-08-21 ("Success. No rows returned."). tickle_entries.tickle_nature
-- is nullable again on the live database, not just in this migration file.
-- =====================================================================

alter table public.tickle_entries
  alter column tickle_nature drop not null;
