-- =====================================================================
-- DayTickles — migration: public "has this entry received an award"
--
-- Exposes only entry_id, deliberately never award_type or user_id --
-- award identity and giver identity stay private (awards' own RLS,
-- migration 0020, still only lets each giver see their own rows).
--
-- This works via the same mechanism public.pinned_entries (0001) already
-- relies on: a plain view with no `security_invoker` and no `FORCE ROW
-- LEVEL SECURITY` on the base table runs the underlying query as the
-- view's owner, which is exempt from the base table's RLS as its owner
-- -- so this view can see every award, across every giver, even though
-- direct queries against `awards` cannot. That bypass is exactly why
-- the view's column list is kept to just entry_id: whatever the real
-- owner/RLS semantics turn out to be in edge cases, the maximum
-- possible exposure through this view is still only "this entry has
-- *some* award," never who gave it or what kind.
--
-- No explicit GRANT -- consistent with the rest of this schema (no
-- table or view here has one), relying on Supabase's default
-- anon/authenticated privileges on the public schema.
-- =====================================================================

create view public.awarded_entries as
select distinct entry_id from public.awards;

comment on view public.awarded_entries is
  'Public-safe: entry_id only. Backs the award stripe/badge shown to everyone on an awarded post, without revealing award_type or who gave it -- see awards RLS (migration 0020) for the actual private data.';
