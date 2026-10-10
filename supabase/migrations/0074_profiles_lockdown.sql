-- 0074_profiles_lockdown.sql
--
-- These statements were already applied by hand in the Supabase SQL editor
-- on 2026-10-10/11 and verified. This file records them so the repo matches
-- the live database. All statements are idempotent.

-- (a) fail_founding_member_enrollment is an internal helper called only by security-definer functions
revoke execute on function public.fail_founding_member_enrollment(uuid, text)
  from public, anon, authenticated;

-- (b) profile reads: signed-in users only (was: everyone, including signed-out)
drop policy if exists "profiles are publicly readable" on public.profiles;
drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "founding_member_slots are publicly readable" on public.founding_member_slots;
drop policy if exists "founding_member_slots readable by signed-in users" on public.founding_member_slots;
create policy "founding_member_slots readable by signed-in users"
  on public.founding_member_slots for select to authenticated using (true);

-- (c) block direct client changes to sensitive profile columns. Tests current_user (not the JWT) so the security-definer Moji/referral functions, which run as the owner, still work.
create or replace function public.protect_profile_sensitive_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.subscription_plan is distinct from old.subscription_plan
       or new.subscription_expires_at is distinct from old.subscription_expires_at
       or new.trial_started_at is distinct from old.trial_started_at
       or new.is_founding_member is distinct from old.is_founding_member
       or new.founding_member_number is distinct from old.founding_member_number
       or new.founding_member_granted_at is distinct from old.founding_member_granted_at
       or new.founding_member_taking_part is distinct from old.founding_member_taking_part
       or new.referral_code is distinct from old.referral_code
       or new.share_count_this_period is distinct from old.share_count_this_period
    then
      raise exception 'These profile fields cannot be changed directly'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_sensitive_columns on public.profiles;
create trigger protect_profile_sensitive_columns
  before update on public.profiles
  for each row execute function public.protect_profile_sensitive_columns();
