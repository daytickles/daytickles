-- =====================================================================
-- Founding Member program v2 — Stage 6 fix: referral_code backfill for
-- pre-0022 accounts, plus a real collision-retry instead of a bare
-- generate-and-hope.
--
-- Live check found 4 of 5 profiles with referral_code = null -- every
-- account created before 0022 introduced the column, since it's only
-- ever set by handle_new_user() at signup time. Backfilled lazily
-- (ensure_founding_member_referral_code, called from
-- advanceFoundingMemberProgress on every FM page load) rather than a
-- bulk update, same reasoning as the lazy enrollment backfill in 0024:
-- avoids a batch write across every existing user row.
--
-- Collision handling: the generated code is 8 hex characters -- only
-- 32 bits of entropy -- and profiles.referral_code is unique (0022).
-- Before this migration, a real collision on that constraint would
-- have raised an uncaught unique_violation, which inside
-- handle_new_user() (a trigger on auth.users) would roll back the
-- whole signup transaction and hard-fail account creation for the
-- unlucky second person. Both generation points now retry on
-- unique_violation with a fresh code, bounded at 5 attempts (then
-- re-raise) so a genuine deeper problem still surfaces as an error
-- rather than looping forever.
-- =====================================================================

create or replace function public.random_founding_member_referral_code()
returns text
language sql
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_referral_code text;
  v_attempts      integer := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    v_referral_code := public.random_founding_member_referral_code();
    begin
      insert into public.profiles (id, username, referral_code)
      values (
        new.id,
        'tickler_' || substr(new.id::text, 1, 8),
        v_referral_code
      );
      exit;
    exception when unique_violation then
      -- Could technically be the pre-existing username constraint
      -- rather than referral_code (username is also just an 8-hex-char
      -- slice of new.id, same entropy concern, but that's a
      -- pre-existing pattern from 0001, not something introduced or
      -- fixed here) -- either way, retrying with a fresh referral_code
      -- is harmless, and the attempt cap keeps a real repeated failure
      -- from hanging signup forever.
      if v_attempts >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.founding_member_enrollment (user_id)
  values (new.id);

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- ensure_founding_member_referral_code: lazy backfill for existing
-- accounts, same p_user_id = auth.uid() guard and idempotent-no-op
-- shape as ensure_founding_member_enrollment (0024).
-- ---------------------------------------------------------------------
create or replace function public.ensure_founding_member_referral_code(p_user_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_existing text;
  v_code     text;
  v_attempts integer := 0;
begin
  if p_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select referral_code into v_existing from public.profiles where id = p_user_id;
  if v_existing is not null then
    return v_existing;
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := public.random_founding_member_referral_code();
    begin
      update public.profiles set referral_code = v_code where id = p_user_id;
      exit;
    exception when unique_violation then
      if v_attempts >= 5 then
        raise;
      end if;
    end;
  end loop;

  return v_code;
end;
$$;
