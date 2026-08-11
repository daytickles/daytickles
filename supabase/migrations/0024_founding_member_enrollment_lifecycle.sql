-- =====================================================================
-- Founding Member program v2 — Stage 3 (enrollment lifecycle).
--
-- No cron/scheduled-function infra exists in this project (supabase/
-- functions/ only has request-triggered delete-account and
-- notify-on-like) -- so, consistent with that, evaluation here is
-- lazy/client-triggered rather than a server-side sweep: the client
-- calls evaluate_founding_member_month() for whichever checkpoint
-- month is next once its window has closed (e.g. on FM page load),
-- same "compute lazily on read" style as lib/sharing.js's
-- currentPeriod() share-cap rollover.
--
-- Existing users (this migration lands well after real signups exist,
-- unlike the original spec's assumption of none) are NOT backfilled
-- with a retroactive enrollment row here. Backdating attempt_started_at
-- to their real signup date would let already-passed historical
-- activity satisfy months whose windows would already read as closed,
-- letting someone clear all 6 months in one sitting -- defeating the
-- program's pacing entirely. Enrollment is created lazily instead
-- (ensure_founding_member_enrollment, forces attempt_started_at =
-- current_date, ignores any caller-supplied date), the first time a
-- user's client asks for their FM state -- giving every existing user
-- a fresh, fair clock starting whenever they first see the feature,
-- in the spirit of the spec's "or from the feature's launch date for
-- existing users" phrasing without hardcoding one global date.
-- =====================================================================

-- ---------------------------------------------------------------------
-- handle_new_user(): also start the FM clock at signup (0022 already
-- extended this trigger once, for referral_code).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, username, referral_code)
  values (
    new.id,
    'tickler_' || substr(new.id::text, 1, 8),
    upper(substr(replace(new.id::text, '-', ''), 1, 8))
  );

  insert into public.founding_member_enrollment (user_id)
  values (new.id);

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- ensure_founding_member_enrollment: lazy enrollment for existing
-- users. p_user_id must be the caller's own id -- forced server-side,
-- not trusted from the client -- and attempt_started_at is always
-- current_date via the table default, never caller-supplied, for the
-- anti-backdating reason above.
-- ---------------------------------------------------------------------
create or replace function public.ensure_founding_member_enrollment(p_user_id uuid)
returns public.founding_member_enrollment
language plpgsql
security definer
as $$
declare
  v_row public.founding_member_enrollment%rowtype;
begin
  if p_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  insert into public.founding_member_enrollment (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_row from public.founding_member_enrollment where user_id = p_user_id;
  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- evaluate_founding_member_month: the one authoritative state-transition
-- step. Locks in pass/fail for exactly one (user, attempt, month_index)
-- -- idempotent, a repeat call for an already-evaluated month is a
-- no-op (returns evaluated: false).
--
-- Nothing about *which window* gets evaluated is trusted from the
-- client:
--   - p_month_index must equal the true next-unevaluated month for
--     this (user, attempt), derived from founding_member_month_result
--     history -- otherwise a direct caller (bypassing the app UI)
--     could skip straight to month 6 once its calendar window has
--     simply closed by the passage of real time, and grab lifetime
--     status without months 1-5 ever being evaluated.
--   - the calendar-month date bounds (start_date/end_date_exclusive)
--     are recomputed here from v_enrollment.attempt_started_at +
--     p_month_index -- the same logic as lib/foundingMember.js's
--     checkpointWindow(), just not trusted from the client this time
--     -- rather than accepted as parameters, since date arithmetic is
--     timezone-free and Postgres can derive them exactly.
--   - the UTC timestamptz bounds (p_start_utc/p_end_utc_exclusive) are
--     still client-supplied, since only the client's device knows its
--     real local-time offset, but are checked against a 14-hour
--     tolerance (the full range of real-world UTC offsets, UTC-12..
--     UTC+14) around the server-recomputed date bounds -- close
--     enough to trust for a real device, too narrow to smuggle in an
--     unrelated day's activity.
--
-- p_user_id must be the caller's own id: this is SECURITY DEFINER, so
-- without that check any authenticated client could evaluate (and
-- mutate) another user's enrollment/profile -- the same class of bug
-- that would have existed in v1's try_award_founding_member(p_user_id),
-- had anything ever called it.
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

  -- Guards a stale client evaluating the attempt that was just
  -- superseded by a restart in another session.
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
  -- MONTHLY_REQUIREMENTS -- two sources of truth for the same 7
  -- numbers. If the spec's monthly targets ever change, both places
  -- need updating or they'll silently disagree (JS would show
  -- different progress/pass state than what actually gets locked in
  -- here). Not worth a shared-config table for 7 static numbers right
  -- now, but flagging it so a future edit doesn't miss one side.
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

    -- Lifetime grant lands here; the numbered-slot claim/grant does
    -- not -- that's Stage 4, which will wire an atomic claim into this
    -- same completion branch (or a follow-up call keyed off
    -- status = 'completed' and founding_member_number is null).
    update public.profiles
       set is_founding_member = true,
           founding_member_granted_at = now(),
           subscription_plan = 'lifetime',
           subscription_expires_at = null
     where id = p_user_id;

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
    update public.founding_member_enrollment
       set attempt_started_at = current_date,
           restart_count = 1
     where user_id = p_user_id;
    -- Releasing a referral-earned reservation belongs here too, once
    -- Stage 4 adds founding_member_slots reservations -- none can
    -- exist yet (queue-jump locking is Stage 5).

    return jsonb_build_object(
      'status', 'active', 'evaluated', true, 'passed', false,
      'month_index', p_month_index, 'restarted', true, 'progress', v_progress
    );
  end if;

  -- Non-recoverable: month 2+ failure, or the restart was already used.
  update public.founding_member_enrollment
     set status = 'failed', failed_at = now()
   where user_id = p_user_id;

  return jsonb_build_object(
    'status', 'failed', 'evaluated', true, 'passed', false,
    'month_index', p_month_index, 'progress', v_progress
  );
end;
$$;
