-- =====================================================================
-- Founding Member post-launch addendum, item 4 — "Take part" toggle
-- becomes a real, permanent exit.
--
-- Turning "Take part" off is no longer a reversible visibility flag --
-- it now drives the exact same terminal state as genuinely failing the
-- quest (see evaluate_founding_member_month's non-recoverable-failure
-- branch), via a new shared helper so the two paths into that terminal
-- state can't drift apart:
--
--   fail_founding_member_enrollment(p_user_id, p_reason) -- the actual
--   state transition (release any reserved slot, clear
--   profiles.founding_member_number, flip founding_member_enrollment
--   to 'failed', mark the closing message as already seen so the nav
--   icon hides immediately). p_reason is stored so a genuine
--   requirements-based failure can always be told apart from a
--   voluntary opt-out later, even though the user-facing closing
--   message is identical for both (per the addendum).
--
--   evaluate_founding_member_month -- re-created (nothing else changes
--   from 0029) to call the helper instead of inlining the three writes
--   itself.
--
--   opt_out_of_founding_member(p_user_id) -- the new entry point for
--   the toggle. Deliberately does NOT reuse evaluate_founding_member_
--   month directly: that function refuses to run until a checkpoint
--   window has actually closed, and would incorrectly route a month-1,
--   restart_count=0 opt-out into the one-time restart-forgiveness
--   branch instead of a hard exit. This function skips straight to the
--   terminal helper, unconditionally, regardless of month or restart
--   history. Also sets founding_member_taking_part = false itself
--   (redundant with the client's own toggle write, but keeps the whole
--   transition atomic instead of depending on two separate round-trips
--   landing in order). Idempotent: a repeat call (double-tap, or a
--   stale confirmation dialog re-firing) against an already-terminal
--   enrollment is a safe no-op, same guard pattern as evaluate_
--   founding_member_month itself.
-- =====================================================================

alter table public.founding_member_enrollment
  add column failure_reason text
    check (failure_reason is null or failure_reason in ('requirements_not_met', 'opted_out'));

comment on column public.founding_member_enrollment.failure_reason is
  'Set only when status = failed. requirements_not_met = a checkpoint month was not passed (and, for month 1, the one-time restart was already used); opted_out = the user chose to stop via the Take Part toggle. The user-facing closing message is identical for both -- this is for support/debugging visibility only. Null for enrollments that failed before this column existed.';


create or replace function public.fail_founding_member_enrollment(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
as $$
begin
  update public.founding_member_slots
     set status = 'available', user_id = null, reserved_at = null
   where user_id = p_user_id and status = 'reserved';

  update public.profiles
     set founding_member_number = null,
         founding_member_failure_message_seen = true
   where id = p_user_id;

  update public.founding_member_enrollment
     set status = 'failed', failed_at = now(), failure_reason = p_reason
   where user_id = p_user_id;
end;
$$;

comment on function public.fail_founding_member_enrollment(uuid, text) is
  'The one place that writes the Founding Member non-recoverable-failure terminal state -- called from both evaluate_founding_member_month (genuine requirements failure) and opt_out_of_founding_member (voluntary exit), so the two paths can never drift apart. Not exposed as a client-callable RPC on its own -- no auth.uid() check here because both callers already did their own.';


-- ---------------------------------------------------------------------
-- evaluate_founding_member_month: re-created (unchanged from 0029
-- except the non-recoverable branch now calls the shared helper above
-- instead of inlining its three writes).
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
  perform public.fail_founding_member_enrollment(p_user_id, 'requirements_not_met');

  return jsonb_build_object(
    'status', 'failed', 'evaluated', true, 'passed', false,
    'month_index', p_month_index, 'progress', v_progress
  );
end;
$$;


-- ---------------------------------------------------------------------
-- opt_out_of_founding_member: the new entry point for the "Take part"
-- toggle's permanent-exit behavior. See header comment for why this
-- can't just call evaluate_founding_member_month directly.
-- ---------------------------------------------------------------------
create or replace function public.opt_out_of_founding_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_enrollment  public.founding_member_enrollment%rowtype;
begin
  if p_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_enrollment
    from public.founding_member_enrollment
   where user_id = p_user_id
   for update;

  if not found or v_enrollment.status <> 'active' then
    -- Already terminal (or never enrolled) -- safe no-op, same shape
    -- as evaluate_founding_member_month's own early-out.
    return jsonb_build_object('status', coalesce(v_enrollment.status, 'none'), 'opted_out', false);
  end if;

  perform public.fail_founding_member_enrollment(p_user_id, 'opted_out');

  update public.profiles
     set founding_member_taking_part = false
   where id = p_user_id;

  return jsonb_build_object('status', 'failed', 'opted_out', true);
end;
$$;
