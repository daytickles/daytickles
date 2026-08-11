-- =====================================================================
-- Founding Member program v2 — Stage 5 (referral codes).
--
-- redeem_founding_member_referral_code takes no target-user parameter
-- at all -- it always acts on auth.uid() -- so there's no ownership
-- check to get wrong: a signed-in user can only ever redeem a code for
-- themselves.
--
-- It does NOT attempt to reserve a slot for the referrer inline. The
-- referrer and the redeemer are two different users, and
-- reserve_founding_member_slot_for_referral (0025) requires
-- p_user_id = auth.uid() -- which, at redemption time, is the
-- redeemer, not the referrer. Rather than inline a duplicate,
-- unguarded copy of that logic for a third party, the referrer's own
-- client opportunistically calls reserve_founding_member_slot_for_
-- referral for themselves the next time their FM state is touched
-- (see lib/foundingMember.js's advanceFoundingMemberProgress) -- same
-- lazy, client-triggered pattern as the rest of this program. That
-- function already re-derives the real referral count from
-- founding_member_referrals itself, so it doesn't matter that the
-- insert below happened in someone else's request.
-- =====================================================================
create or replace function public.redeem_founding_member_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_referrer_id  uuid;
  v_already      boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_referrer_id
    from public.profiles
   where referral_code = upper(trim(p_code));

  if v_referrer_id is null then
    return jsonb_build_object('redeemed', false, 'reason', 'invalid_code');
  end if;

  if v_referrer_id = auth.uid() then
    return jsonb_build_object('redeemed', false, 'reason', 'self_referral');
  end if;

  select exists(
    select 1 from public.founding_member_referrals where referred_id = auth.uid()
  ) into v_already;

  if v_already then
    return jsonb_build_object('redeemed', false, 'reason', 'already_redeemed');
  end if;

  insert into public.founding_member_referrals (referrer_id, referred_id)
  values (v_referrer_id, auth.uid());

  return jsonb_build_object('redeemed', true);
end;
$$;
