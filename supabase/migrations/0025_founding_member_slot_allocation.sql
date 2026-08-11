-- =====================================================================
-- Founding Member program v2 — Stage 4 (numbered-slot allocation).
--
-- Two entry points into founding_member_slots, both SECURITY DEFINER
-- and both safe to expose directly to any authenticated client (not
-- just "trusted" internal callers) because each re-derives its own
-- eligibility from stored ground truth rather than accepting a
-- caller's word for it:
--
--   - grant_founding_member_slot: only proceeds if
--     founding_member_enrollment.status = 'completed' for that user,
--     re-checked here, not assumed. Without this, a direct call could
--     hand out a permanent numbered slot to someone who never
--     completed the 6-month quest.
--   - reserve_founding_member_slot_for_referral: only proceeds if the
--     caller actually has 2+ rows in founding_member_referrals as
--     referrer, re-counted here. Without this, a direct call could
--     queue-jump without ever having referred anyone.
--
-- Both use the standard "SELECT ... FOR UPDATE SKIP LOCKED" queue-claim
-- pattern to atomically grab the lowest available number: concurrent
-- claimers each lock a different row instead of blocking on each
-- other, and the UPDATE...FROM only fires against the row this
-- transaction actually locked, so two people finishing at the same
-- instant can never receive the same number.
-- =====================================================================

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
    -- Finalize an existing referral reservation rather than claiming a
    -- second number. Idempotent no-op if it's already granted (e.g. a
    -- retried call after the first one already succeeded).
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

  -- v_claimed_number stays null if the pool is exhausted -- the person
  -- keeps their lifetime status/badge regardless (already granted by
  -- evaluate_founding_member_month before this is called); they simply
  -- have no numbered badge. Surfacing that state is a later UI concern.
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

  if v_claimed_number is not null then
    update public.profiles set founding_member_number = v_claimed_number where id = p_user_id;
  end if;

  return v_claimed_number;
end;
$$;


-- ---------------------------------------------------------------------
-- evaluate_founding_member_month: re-created (not just altered) to
-- wire in slot allocation at the two points the spec calls for --
-- everything else is unchanged from 0024.
--
--   - On month-6 completion: calls grant_founding_member_slot, which
--     claims a fresh number or finalizes an existing reservation.
--   - On the month-1 restart: releases any reserved slot back to
--     'available' and clears profiles.founding_member_number, per the
--     spec ("a restart also releases any referral-earned number
--     reservation back into the pool").
--   - On non-recoverable failure (month 2+, or restart already used):
--     same release. The spec only spells this out for the restart
--     case, but the same principle clearly applies -- a reservation
--     that can now never be completed shouldn't sit out of the pool
--     forever. Flagging this as a filled-in gap, not an explicit spec
--     instruction.
-- ---------------------------------------------------------------------
create or replace function public.evaluate_founding_member_month(
  p_user_id uuid,
  p_attempt integer,
  p_month_index integer,
  p_start_utc timestamptz,
  p_end_utc_exclusive timestamptz
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_enrollment          public.founding_member_enrollment%rowtype;
  v_expected_month      integer;
  v_expected_start      date;
  v_expected_end_excl   date;
  v_utc_tolerance       constant interval := interval '14 hours';
  v_progress            jsonb;
  v_passed              boolean;
begin
  if p_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_enrollment
    from public.founding_member_enrollment
   where user_id = p_user_id
   for update;

  if not found or v_enrollment.status <> 'active' then
    return jsonb_build_object('status', coalesce(v_enrollment.status, 'none'), 'evaluated', false);
  end if;

  if p_attempt <> v_enrollment.restart_count + 1 then
    return jsonb_build_object('status', v_enrollment.status, 'evaluated', false, 'reason', 'stale_attempt');
  end if;

  select coalesce(max(month_index), 0) + 1 into v_expected_month
    from public.founding_member_month_result
   where user_id = p_user_id and attempt = p_attempt;

  if p_month_index <> v_expected_month then
    return jsonb_build_object('status', v_enrollment.status, 'evaluated', false, 'reason', 'month_index_mismatch');
  end if;

  if p_month_index = 1 then
    v_expected_start := v_enrollment.attempt_started_at;
    v_expected_end_excl := (date_trunc('month', v_enrollment.attempt_started_at) + interval '1 month')::date;
  else
    v_expected_start := (date_trunc('month', v_enrollment.attempt_started_at)
                          + (p_month_index - 1) * interval '1 month')::date;
    v_expected_end_excl := (date_trunc('month', v_enrollment.attempt_started_at)
                             + p_month_index * interval '1 month')::date;
  end if;

  if p_start_utc < (v_expected_start::timestamp at time zone 'UTC') - v_utc_tolerance
     or p_start_utc > (v_expected_start::timestamp at time zone 'UTC') + v_utc_tolerance
     or p_end_utc_exclusive < (v_expected_end_excl::timestamp at time zone 'UTC') - v_utc_tolerance
     or p_end_utc_exclusive > (v_expected_end_excl::timestamp at time zone 'UTC') + v_utc_tolerance
  then
    return jsonb_build_object('status', v_enrollment.status, 'evaluated', false, 'reason', 'utc_window_out_of_tolerance');
  end if;

  if p_end_utc_exclusive > now() then
    return jsonb_build_object('status', v_enrollment.status, 'evaluated', false, 'reason', 'window_not_closed');
  end if;

  v_progress := public.compute_founding_member_month_progress(
    p_user_id, v_expected_start, v_expected_end_excl, p_start_utc, p_end_utc_exclusive
  );

  -- Thresholds duplicated from lib/foundingMember.js's
  -- MONTHLY_REQUIREMENTS -- see the note there; two sources of truth
  -- for the same 7 numbers.
  v_passed :=
    coalesce((v_progress->>'shared_to_feed_count')::int, 0) >= 6 and
    coalesce((v_progress->>'photos_shared_count')::int, 0) >= 6 and
    coalesce((v_progress->>'likes_given_count')::int, 0) >= 2 and
    coalesce((v_progress->>'favorited_count')::int, 0) >= 4 and
    coalesce((v_progress->>'made_me_smile_count')::int, 0) >= 2 and
    coalesce((v_progress->>'paying_forward_count')::int, 0) >= 2 and
    coalesce((v_progress->>'mood_boost_count')::int, 0) >= 2;

  insert into public.founding_member_month_result (user_id, attempt, month_index, passed)
  values (p_user_id, p_attempt, p_month_index, v_passed)
  on conflict (user_id, attempt, month_index) do nothing;

  if v_passed and p_month_index = 6 then
    update public.founding_member_enrollment
       set status = 'completed', completed_at = now()
     where user_id = p_user_id;

    update public.profiles
       set is_founding_member = true,
           founding_member_granted_at = now(),
           subscription_plan = 'lifetime',
           subscription_expires_at = null
     where id = p_user_id;

    perform public.grant_founding_member_slot(p_user_id);

    return jsonb_build_object(
      'status', 'completed', 'evaluated', true, 'passed', true,
      'month_index', p_month_index, 'progress', v_progress
    );
  end if;

  if v_passed then
    return jsonb_build_object(
      'status', 'active', 'evaluated', true, 'passed', true,
      'month_index', p_month_index, 'progress', v_progress
    );
  end if;

  -- Failed. Month 1 with the restart still available: one fresh start,
  -- clock reset to today, attempt bumped -- not a hard failure.
  if p_month_index = 1 and v_enrollment.restart_count = 0 then
    update public.founding_member_slots
       set status = 'available', user_id = null, reserved_at = null
     where user_id = p_user_id and status = 'reserved';

    update public.profiles
       set founding_member_number = null
     where id = p_user_id;

    update public.founding_member_enrollment
       set attempt_started_at = current_date,
           restart_count = 1
     where user_id = p_user_id;

    return jsonb_build_object(
      'status', 'active', 'evaluated', true, 'passed', false,
      'month_index', p_month_index, 'restarted', true, 'progress', v_progress
    );
  end if;

  -- Non-recoverable: month 2+ failure, or the restart was already used.
  update public.founding_member_slots
     set status = 'available', user_id = null, reserved_at = null
   where user_id = p_user_id and status = 'reserved';

  update public.profiles
     set founding_member_number = null
   where id = p_user_id;

  update public.founding_member_enrollment
     set status = 'failed', failed_at = now()
   where user_id = p_user_id;

  return jsonb_build_object(
    'status', 'failed', 'evaluated', true, 'passed', false,
    'month_index', p_month_index, 'progress', v_progress
  );
end;
$$;
