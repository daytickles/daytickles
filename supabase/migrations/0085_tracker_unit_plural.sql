-- 0085_tracker_unit_plural.sql
--
-- Trackers with the method 'amount' get an optional second form of the unit
-- for any amount other than exactly 1: unit 'cup', unit_plural 'cups' shows
-- "1 cup" and "2 cups". The app suggests the plural while the user types the
-- unit and lets them change or clear it. Null means "show the unit as typed",
-- which is what every existing tracker does today, so existing rows need no
-- change. Only the tracker stores the unit; ratings store just the number.
-- Run by hand in the Supabase SQL editor.

alter table public.trackers
  add column if not exists unit_plural text;

alter table public.trackers
  drop constraint if exists trackers_unit_plural_length;
alter table public.trackers
  add constraint trackers_unit_plural_length
  check (unit_plural is null or char_length(btrim(unit_plural)) between 1 and 20);

alter table public.trackers
  drop constraint if exists trackers_unit_plural_amount_only;
alter table public.trackers
  add constraint trackers_unit_plural_amount_only
  check (method = 'amount' or unit_plural is null);

alter table public.trackers
  drop constraint if exists trackers_unit_plural_needs_unit;
alter table public.trackers
  add constraint trackers_unit_plural_needs_unit
  check (unit_plural is null or unit is not null);

comment on column public.trackers.unit_plural is
  'Only for method ''amount'': the unit shown for any amount other than exactly 1 (for example cups). Null = show unit as typed.';

-- No trigger, function or policy changes: the existing row-level policies on
-- public.trackers already cover a new column, and lock_tracker_method,
-- check_tracker_rating and enforce_tracker_cap do not look at it.

-- Check after applying (read-only):
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'trackers' and column_name = 'unit_plural';  -- 1 row, text, YES
--   select conname from pg_constraint
--    where conrelid = 'public.trackers'::regclass and conname like 'trackers_unit_plural%'
--    order by conname;   -- 3 rows: amount_only, length, needs_unit
--   select count(*) from public.trackers where unit_plural is not null;   -- 0
