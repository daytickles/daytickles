-- =====================================================================
-- Founding Member post-launch addendum, item 3 follow-up — trim the
-- original 1000-row seed down to the intended first bracket (26-100,
-- 75 real numbers after 1-25's removal in 0030). The auto-expansion
-- logic added in 0030 assumed the pool already started at the 100-cap
-- bracket; that never actually happened, because 0022's one-time seed
-- inserted 1-1000 in a single statement well before 0030 existed. This
-- corrects that gap.
--
-- Safety: only ever deletes rows still status = 'available'. Before
-- doing anything, explicitly checks for any row above 100 that is NOT
-- available (already reserved or granted to a real user) and raises an
-- exception, aborting the whole migration, if it finds one -- rather
-- than silently skip it and end up with a cap that doesn't match
-- reality. Expected result, given the feature is ~2 weeks old and
-- numbers are always claimed lowest-first: zero such rows -- enforced
-- here, not assumed.
-- =====================================================================

do $$
declare
  v_bad_count integer;
begin
  select count(*) into v_bad_count
    from public.founding_member_slots
   where number > 100
     and status <> 'available';

  if v_bad_count > 0 then
    raise exception
      'Refusing to trim the slot pool: % slot(s) above 100 are already reserved or granted. Investigate before re-running.',
      v_bad_count;
  end if;
end;
$$;

delete from public.founding_member_slots
 where number > 100
   and status = 'available';

update public.app_config
   set founding_members_cap = 100
 where id = 1;
