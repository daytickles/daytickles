-- =====================================================================
-- DayTickles — migration: Onboarding feature
-- Recovered from a separate conversation where this was authored and
-- confirmed run against the live project. Adds two profile fields
-- used by the onboarding flow (first-run username/avatar setup).
-- =====================================================================

alter table public.profiles
  add column if not exists onboarded boolean not null default false;

alter table public.profiles
  add column if not exists avatar_emoji text;

comment on column public.profiles.onboarded is
  'Whether the person has completed first-run onboarding (username confirmation, avatar pick). Distinct from colorSetupDone in the Expo prototype — that one is the accent-color step; this is the broader onboarding flow being built against the real backend.';

-- The other conversation recreated the profile-update policy under a
-- new name ("users update own profile") rather than replacing the
-- original ("users can update their own profile" from 0001). Since
-- Postgres combines multiple permissive policies for the same command
-- with OR, leaving both wouldn't be a security hole (the original's
-- USING clause is identical), but it is redundant clutter. Drop both
-- possible names and recreate one canonical policy, now with an
-- explicit WITH CHECK (the original omitted it, relying on USING being
-- reused implicitly — this makes the intent explicit rather than implicit).
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
