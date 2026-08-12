-- =====================================================================
-- Founding Member post-launch addendum, item 2 — monthly threshold
-- update. Re-creates evaluate_founding_member_month (unchanged from
-- 0025 except the two thresholds below) since this is the one
-- authoritative pass/fail lock-in; lib/foundingMember.js's
-- MONTHLY_REQUIREMENTS is updated to match in the same commit so the
-- two sources of truth don't disagree (see the note on both).
--
--   "Made me smile" tag: 2 -> 8
--   "Mood boost" tag:     2 -> 4
--
-- Nothing else about this function changes from 0025.
-- =====================================================================
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
  -- for the same 7 numbers. Updated per the post-launch addendum:
  -- made_me_smile_count 2->8, mood_boost_count 2->4.
  v_passed :=
    coalesce((v_progress->>'shared_to_feed_count')::int, 0) >= 6 and
    coalesce((v_progress->>'photos_shared_count')::int, 0) >= 6 and
    coalesce((v_progress->>'likes_given_count')::int, 0) >= 2 and
    coalesce((v_progress->>'favorited_count')::int, 0) >= 4 and
    coalesce((v_progress->>'made_me_smile_count')::int, 0) >= 8 and
    coalesce((v_progress->>'paying_forward_count')::int, 0) >= 2 and
    coalesce((v_progress->>'mood_boost_count')::int, 0) >= 4;

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
