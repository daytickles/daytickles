-- 0077_awarded_entries_revoke_all_anon.sql
--
-- Applied by hand in the SQL editor on 2026-10-11, after 0076. Removes all
-- remaining anon privileges on the awarded_entries view (0076 removed
-- SELECT only).

revoke all on public.awarded_entries from anon;
