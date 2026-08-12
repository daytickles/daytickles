-- =====================================================================
-- Founding Member post-launch addendum, item 3 — reserved range +
-- auto-expanding pool.
--
-- Two changes:
--   1. Numbers 1-25 are retired permanently for future projects. All
--      of them are still status='available' in production (confirmed
--      2026-08-12, nothing reserved/granted) so this is a plain
--      delete -- no user is affected. Going forward, the allocation
--      functions' "lowest available number" pick needs no special-
--      casing to skip 1-25: since no rows for those numbers exist,
--      they're simply never selectable, per the addendum's own
--      "simplest implementation" note.
--   2. The pool now auto-expands in blocks of 100 (100 -> 200 -> 300
--      -> ...) the moment the current bracket is exhausted, instead
--      of being a fixed 1000-cap. expand_founding_member_slot_pool_
--      if_exhausted() is a new shared helper, called from inside both
--      grant_founding_member_slot and reserve_founding_member_slot_
--      for_referral right after their existing SKIP LOCKED claim
--      attempt comes back empty. It takes a FOR UPDATE lock on the
--      single app_config row before seeding the next block, so two
--      concurrent last-claimers can't both bump the cap (the second
--      one to acquire the lock re-checks for availability first and
--      finds the rows the first one just seeded, so it never expands
--      a second time for the same exhaustion event).
--
-- Known, permanent consequence: because 1-25 are gone, the first real
-- bracket (26-100) has only 75 claimable numbers while every bracket
-- after it has a full 100. Not a bug.
-- =====================================================================

delete from public.founding_member_slots
 where number between 1 and 25
   and status = 'available';

create or replace function public.expand_founding_member_slot_pool_if_exhausted()
returns void
language plpgsql
security definer
as $$
declare
  v_still_available  boolean;
  v_cap              integer;
  v_new_cap          integer;
begin
  select exists(
    select 1 from public.founding_member_slots where status = 'available'
  ) into v_still_available;

  if v_still_available then
    return;
  end if;

  -- Serializes concurrent expanders: whoever gets here first holds this
  -- lock until it commits, so a second concurrent caller blocks here
  -- and then re-checks (below) before deciding whether it still needs
  -- to expand.
  select founding_members_cap into v_cap
    from public.app_config
   where id = 1
     for update;

  select exists(
    select 1 from public.founding_member_slots where status = 'available'
  ) into v_still_available;

  if v_still_available then
    return; -- someone else already expanded while we waited for the lock
  end if;

  v_new_cap := v_cap + 100;

  insert into public.founding_member_slots (number)
  select generate_series(v_cap + 1, v_new_cap)
  on conflict (number) do nothing;

  update public.app_config set founding_members_cap = v_new_cap where id = 1;
end;
$$;

comment on function public.expand_founding_member_slot_pool_if_exhausted() is
  'Seeds the next 100-number block into founding_member_slots and bumps app_config.founding_members_cap to match, but only if no available row exists (double-checked before and after taking a lock on the app_config row, to stay safe under concurrent callers). No-op if slots are still available. Called from grant_founding_member_slot / reserve_founding_member_slot_for_referral.';


create or replace function public.grant_founding_member_slot(p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_enrollment_status  text;
  v_existing_number    integer;
  v_claimed_number     integer;
begin
  if p_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select status into v_enrollment_status
    from public.founding_member_enrollment
   where user_id = p_user_id;

  if v_enrollment_status is distinct from 'completed' then
    raise exception 'founding member quest not completed';
  end if;

  select founding_member_number into v_existing_number
    from public.profiles
   where id = p_user_id;

  if v_existing_number is not null then
    update public.founding_member_slots
       set status = 'granted', granted_at = coalesce(granted_at, now())
     where number = v_existing_number
       and user_id = p_user_id
       and status = 'reserved';
    return v_existing_number;
  end if;

  with next_slot as (
    select number from public.founding_member_slots
     where status = 'available'
     order by number
     limit 1
     for update skip locked
  )
  update public.founding_member_slots s
     set status = 'granted', user_id = p_user_id, granted_at = now()
    from next_slot
   where s.number = next_slot.number
  returning s.number into v_claimed_number;

  -- Pool looked exhausted -- expand and try exactly once more before
  -- accepting "no numbered badge" (see expand_founding_member_slot_pool_
  -- if_exhausted's own no-op guard for the concurrent-caller case).
  if v_claimed_number is null then
    perform public.expand_founding_member_slot_pool_if_exhausted();

    with next_slot as (
      select number from public.founding_member_slots
       where status = 'available'
       order by number
       limit 1
       for update skip locked
    )
    update public.founding_member_slots s
       set status = 'granted', user_id = p_user_id, granted_at = now()
      from next_slot
     where s.number = next_slot.number
    returning s.number into v_claimed_number;
  end if;

  if v_claimed_number is not null then
    update public.profiles set founding_member_number = v_claimed_number where id = p_user_id;
  end if;

  return v_claimed_number;
end;
$$;


create or replace function public.reserve_founding_member_slot_for_referral(p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_referral_count   integer;
  v_enrollment       public.founding_member_enrollment%rowtype;
  v_existing_number  integer;
  v_claimed_number   integer;
begin
  if p_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select count(*) into v_referral_count
    from public.founding_member_referrals
   where referrer_id = p_user_id;

  if v_referral_count < 2 then
    return null; -- threshold not met yet -- not an error, just nothing to do
  end if;

  select * into v_enrollment
    from public.founding_member_enrollment
   where user_id = p_user_id
   for update;

  if not found or v_enrollment.status <> 'active' then
    return null; -- nothing left to jump the queue for
  end if;

  select founding_member_number into v_existing_number
    from public.profiles
   where id = p_user_id;

  if v_existing_number is not null then
    return v_existing_number; -- already reserved or granted -- idempotent
  end if;

  with next_slot as (
    select number from public.founding_member_slots
     where status = 'available'
     order by number
     limit 1
     for update skip locked
  )
  update public.founding_member_slots s
     set status = 'reserved', user_id = p_user_id, reserved_at = now()
    from next_slot
   where s.number = next_slot.number
  returning s.number into v_claimed_number;

  if v_claimed_number is null then
    perform public.expand_founding_member_slot_pool_if_exhausted();

    with next_slot as (
      select number from public.founding_member_slots
       where status = 'available'
       order by number
       limit 1
       for update skip locked
    )
    update public.founding_member_slots s
       set status = 'reserved', user_id = p_user_id, reserved_at = now()
      from next_slot
     where s.number = next_slot.number
    returning s.number into v_claimed_number;
  end if;

  if v_claimed_number is not null then
    update public.profiles set founding_member_number = v_claimed_number where id = p_user_id;
  end if;

  return v_claimed_number;
end;
$$;
