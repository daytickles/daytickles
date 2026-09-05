-- =====================================================================
-- DayTickles — Day Dots: widen dot_index for the 4th dot
--
-- Day Dots moved from a fixed evening-window prompt on Home to a
-- permanent card on the "My Day" filtered view (app/(tabs)/feed.js),
-- now with 4 dots instead of 3. No RLS change: 0060's select/insert/
-- delete-only policies (no update) already match "final once given",
-- unchanged by this migration.
--
-- Postgres's default name for a column-level CHECK is
-- <table>_<column>_check -- confirm this is still the actual name
-- (via pg_constraint) before running, in case it was ever renamed.
-- =====================================================================

alter table public.day_dots drop constraint day_dots_dot_index_check;
alter table public.day_dots add constraint day_dots_dot_index_check check (dot_index between 0 and 3);

comment on column public.day_dots.dot_index is
  'Which of the 4 unlabeled dots (0-3), only set when status = answered. No stated meaning app-side -- purely the users own private association.';
