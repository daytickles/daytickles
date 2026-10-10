-- 0076_tickle_entries_signed_in_only.sql
--
-- Applied by hand in the SQL editor on 2026-10-11. Rippled Tickles and
-- the awarded_entries view are no longer readable without signing in.

alter policy "entries visible to owner or if public" on public.tickle_entries to authenticated;
revoke select on public.awarded_entries from anon;
