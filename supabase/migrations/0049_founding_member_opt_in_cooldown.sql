-- =====================================================================
-- Founding Member — explicit opt-in cooldown.
--
-- Replaces silent auto-enrollment at signup with a genuine gate: every
-- new enrollment row now starts life as 'pending_opt_in', not 'active',
-- and the real 6-month clock (attempt_started_at) does not start until
-- the person takes a distinct, explicit opt-in action. Not opting in
-- within 14 days of enrollment-row creation closes the opportunity
-- permanently, via the exact same terminal-state helper used for a
-- genuine requirements failure and for a voluntary "Take part" opt-out
-- (fail_founding_member_enrollment, migration 0031) -- same closed-state
-- card, same messaging, one more p_reason value.
--
-- Design notes:
-- - No new "cooldown deadline" column. created_at (already set at row
--   creation, whether by handle_new_user() at signup or by
--   ensure_founding_member_enrollment() for a legacy account's first
--   contact with the feature) is the cooldown-start reference; the
--   deadline is always created_at + 14 days, computed where needed --
--   matching this table's existing "derive it, don't store it" style
--   (see checkpointWindow() in lib/foundingMember.js for the same
--   philosophy applied to the monthly windows).
-- - attempt_started_at loses its NOT NULL and its default: it now
--   genuinely means "the 6-month clock hasn't started yet" while null,
--   for real, rather than defaulting to a clock that silently started
--   at row creation. opt_in_to_founding_member is the only place that
--   ever sets it going forward.
-- - Expiry is checked lazily inside ensure_founding_member_enrollment --
--   the one function every FM-state read already funnels through
--   (advanceFoundingMemberProgress calls it on every FM page load) --
--   rather than a cron, consistent with every other state transition
--   in this program.
-- - Legacy-account precedent (0024): a pre-existing account's first
--   contact with the feature gets a fresh row and a fresh clock, not a
--   backdated one. Applied here unchanged: ensure_founding_member_
--   enrollment's insert-if-missing now lands in 'pending_opt_in' with
--   its own fresh 14-day cooldown starting from that first-contact
--   moment, not grandfathered into 'active'.
-- - Referral queue-jump counting (0025/0030): a referred friend who
--   hasn't opted in yet must not count toward the referrer's 2-referral
--   threshold at all (no provisional/pending display) -- a natural
--   consequence of gating on the friend's own enrollment status, not
--   new logic bolted on. count_opted_in_founding_member_referrals is
--   the single source of truth for this, called both from the server
--   reservation check and the client's own display, so the two can't
--   disagree.
-- =====================================================================

-- ---------------------------------------------------------------------
-- founding_member_enrollment: widen status, relax attempt_started_at,
-- widen failure_reason. Constraint names are Postgres's auto-generated
-- defaults for the original unnamed inline CHECKs (0022 for status,
-- 0031 for failure_reason) -- same "fails loudly if the name's wrong,
-- rather than silently misapplying" reasoning as migration 0035.
-- ---------------------------------------------------------------------
alter table public.founding_member_enrollment
  drop constraint founding_member_enrollment_status_check;

alter table public.founding_member_enrollment
  add constraint founding_member_enrollment_status_check
  check (status in ('pending_opt_in', 'active', 'completed', 'failed'));

alter table public.founding_member_enrollment
  alter column status set default 'pending_opt_in';

alter table public.founding_member_enrollment
  alter column attempt_started_at drop not null;

alter table public.founding_member_enrollment
  alter column attempt_started_at drop default;

alter table public.founding_member_enrollment
  drop constraint founding_member_enrollment_failure_reason_check;

alter table public.founding_member_enrollment
  add constraint founding_member_enrollment_failure_reason_check
  check (failure_reason is null or failure_reason in ('requirements_not_met', 'opted_out', 'opt_in_expired'));

comment on column public.founding_member_enrollment.status is
  'pending_opt_in = enrolled but has not yet taken the explicit opt-in action; the 6-month clock has not started (attempt_started_at is null). active = clock running. failed is non-recoverable (restart already used, a post-month-1 failure, a voluntary opt-out, or the 14-day opt-in cooldown expiring -- see failure_reason). completed means all 6 months passed in the current attempt.';

comment on column public.founding_member_enrollment.attempt_started_at is
  'Null while status = pending_opt_in -- the clock has not started yet. Set once, to current_date, by opt_in_to_founding_member. Matches lib/week.js-style local-date handling, not UTC. Resets to the restart date if restart_count goes 0 -> 1.';

comment on column public.founding_member_enrollment.failure_reason is
  'Set only when status = failed. requirements_not_met = a checkpoint month was not passed (and, for month 1, the one-time restart was already used); opted_out = the user chose to stop via the Take Part toggle; opt_in_expired = the 14-day opt-in cooldown closed without an explicit opt-in action. The user-facing closing message is identical for all three -- this is for support/debugging visibility only. Null for enrollments that failed before this column existed.';


-- ---------------------------------------------------------------------
-- opt_in_to_founding_member: the one distinct, explicit action that
-- starts the real 6-month clock. Idempotent no-op if status is
-- anything other than 'pending_opt_in' (already opted in, or already
-- terminal) -- merely opening/visiting the FM page never calls this.
-- Re-validates the cooldown against created_at itself rather than
-- trusting a stale client that loaded the page before the deadline and
-- only tapped the button after -- routes to the exact same expiry path
-- ensure_founding_member_enrollment's lazy check would eventually take,
-- just triggered here instead of on some later visit.
-- ---------------------------------------------------------------------
create or replace function public.opt_in_to_founding_member(p_user_id uuid)
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

  if not found then
    return jsonb_build_object('status', 'none', 'opted_in', false);
  end if;

  if v_enrollment.status <> 'pending_opt_in' then
    return jsonb_build_object('status', v_enrollment.status, 'opted_in', false);
  end if;

  if now() > v_enrollment.created_at + interval '14 days' then
    perform public.fail_founding_member_enrollment(p_user_id, 'opt_in_expired');
    return jsonb_build_object('status', 'failed', 'opted_in', false, 'reason', 'cooldown_expired');
  end if;

  update public.founding_member_enrollment
     set status = 'active',
         attempt_started_at = current_date
   where user_id = p_user_id;

  return jsonb_build_object('status', 'active', 'opted_in', true);
end;
$$;

comment on function public.opt_in_to_founding_member(uuid) is
  'The explicit opt-in action (a real button in app/founding-member.js) that starts the 6-month clock. Idempotent against a repeat call once already active/terminal. If the 14-day cooldown has already lapsed by the time this is called, routes to the same terminal state ensure_founding_member_enrollment''s own lazy expiry check would otherwise take.';


-- ---------------------------------------------------------------------
-- ensure_founding_member_enrollment: re-created to also lazily expire a
-- stale pending_opt_in row before returning -- the one place every
-- FM-state read already funnels through (advanceFoundingMemberProgress
-- calls this on every FM page load), consistent with every other
-- lazy/client-triggered evaluation in this program. FOR UPDATE on the
-- read guards against a concurrent opt-in racing this same check.
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

  select * into v_row
    from public.founding_member_enrollment
   where user_id = p_user_id
   for update;

  if v_row.status = 'pending_opt_in' and now() > v_row.created_at + interval '14 days' then
    perform public.fail_founding_member_enrollment(p_user_id, 'opt_in_expired');
    select * into v_row from public.founding_member_enrollment where user_id = p_user_id;
  end if;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- count_opted_in_founding_member_referrals: single source of truth for
-- "how many of this user's referrals have actually opted in", shared by
-- the server-side reservation check below and the client's own
-- referral-count display (app/founding-member.js). SECURITY DEFINER,
-- not INVOKER like compute_founding_member_month_progress (0023) --
-- this one has to read OTHER users' (the referred friends')
-- founding_member_enrollment.status, which their own RLS policy
-- (auth.uid() = user_id) would otherwise block. The ownership check is
-- folded into the query itself rather than an explicit
-- IF/RAISE EXCEPTION (this is a plain SQL function, not plpgsql) -- a
-- mismatched p_user_id just yields a harmless 0, same "wrong id leaks
-- nothing, just returns zero" property 0023's own comment describes.
-- ---------------------------------------------------------------------
create or replace function public.count_opted_in_founding_member_referrals(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.founding_member_referrals r
    join public.founding_member_enrollment e on e.user_id = r.referred_id
   where r.referrer_id = p_user_id
     and e.status <> 'pending_opt_in'
     and p_user_id = auth.uid();
$$;

comment on function public.count_opted_in_founding_member_referrals(uuid) is
  'How many of p_user_id''s referred friends have actually taken the explicit opt-in action -- an un-opted-in friend does not count at all (no provisional/pending display). Shared by reserve_founding_member_slot_for_referral and app/founding-member.js''s own referral-count display, so they cannot disagree.';


-- ---------------------------------------------------------------------
-- reserve_founding_member_slot_for_referral: re-created (unchanged from
-- 0030, including its pool-expansion fallback) except the inline
-- referral count is replaced by the shared function above.
-- ---------------------------------------------------------------------
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

  select public.count_opted_in_founding_member_referrals(p_user_id) into v_referral_count;

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
