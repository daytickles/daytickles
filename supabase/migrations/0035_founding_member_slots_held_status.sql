-- =====================================================================
-- Founding Member — retire numbers 1-25 as 'held', not deleted.
--
-- Migration 0030 deleted rows 1-25 outright (they'd been retired
-- permanently for future projects, per that migration's own header).
-- This migration instead preserves them under a new 'held' status:
--
--   - Excluded from every claim path exactly like a deleted row would
--     be -- grant_founding_member_slot, reserve_founding_member_slot_
--     for_referral, and expand_founding_member_slot_pool_if_exhausted's
--     own exhaustion check all filter strictly on status = 'available'
--     (confirmed against the live function definitions in 0030/0025;
--     none of them are touched by this migration).
--   - Also excluded from both client-side "available" queries in
--     app/founding-member.js (the "next number available" lookup and
--     the pool-stats "still available" count), same reason.
--   - But kept as real rows, unlike a hard delete, so they're available
--     for a future manual promotional allocation rather than gone.
--
-- The status check constraint was defined inline in the original
-- CREATE TABLE (migration 0022) with no explicit name, so this widens
-- Postgres's auto-generated default name for an unnamed column-level
-- CHECK (<table>_<column>_check). If that name is wrong, this fails
-- loudly at the DROP CONSTRAINT step (undefined constraint) rather
-- than silently misapplying.
-- =====================================================================

alter table public.founding_member_slots
  drop constraint founding_member_slots_status_check;

alter table public.founding_member_slots
  add constraint founding_member_slots_status_check
  check (status in ('available', 'reserved', 'granted', 'held'));

comment on column public.founding_member_slots.status is
  'available = claimable now. reserved = referral-earned, locked to a specific user pending quest completion. granted = permanently awarded. held = retired from normal circulation (currently numbers 1-25) -- reserved for a future manual promotional allocation, not currently claimable by any code path.';

insert into public.founding_member_slots (number, status)
select generate_series(1, 25), 'held'
on conflict (number) do nothing;
