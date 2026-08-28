-- =====================================================================
-- DayTickles — migration: reveal award type on the public badge
--
-- Product decision (2026-08-29): giving/receiving a High Five is meant
-- to be celebratory and worth surfacing openly, not something to keep
-- quiet -- reversing 0021's original privacy-by-design choice.
-- awarded_entries now exposes WHICH award type(s) an entry received,
-- not just that it received one.
--
-- Still never exposes user_id -- who gave an award stays private (the
-- `awards` table's own RLS, migration 0020, is unchanged: only the
-- giver can SELECT their own row). Only "this entry has a Wordweaver/
-- Soulweaver/Wittweaver" becomes public; who gave it does not.
--
-- One row per DISTINCT (entry_id, award_type), not per giver -- an
-- entry can receive the same type from multiple people (collapses to
-- one row) or different types from different people (one row per
-- distinct type present, so the public badge can show every type the
-- entry actually received, not just one).
-- =====================================================================

create or replace view public.awarded_entries as
select distinct entry_id, award_type from public.awards;

comment on view public.awarded_entries is
  'Public: entry_id + award_type, one row per distinct type an entry has received. Backs the award badge shown to everyone on an awarded post -- deliberately reveals WHICH type(s) were given (see migration 0054), but never who gave it -- see awards RLS (migration 0020) for giver identity, which stays private.';
