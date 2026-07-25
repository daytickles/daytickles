-- =====================================================================
-- DayTickles — migration: add 'day_journal' to tickle_nature
-- Day Journal is a 4th possible value for the same tickle_nature field,
-- not a new column — per the design decision that it's "one value per
-- entry," mutually exclusive with received/given/self, just gated by
-- its own independent toggle (separate from tickle_nature_enabled).
-- Extending the existing constraint keeps that single-field, one-value
-- shape intact rather than introducing a second, overlapping field.
--
-- tickle_entries_tickle_nature_check is the auto-generated name Postgres
-- gave the unnamed column-level check from 0007_tickle_nature.sql
-- (standard <table>_<column>_check naming) — confirmed as the real
-- constraint name before writing this drop/recreate.
-- =====================================================================

alter table public.tickle_entries
  drop constraint tickle_entries_tickle_nature_check;

alter table public.tickle_entries
  add constraint tickle_entries_tickle_nature_check
  check (tickle_nature in ('received', 'given', 'self', 'day_journal'));
