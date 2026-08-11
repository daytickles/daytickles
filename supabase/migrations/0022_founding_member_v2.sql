-- =====================================================================
-- Founding Member program v2 — Stage 1 (schema only, no app-facing
-- logic yet). Replaces the unused v1 design (first-25-globally,
-- 14-day window, 3-month reward) with the 1000-slot / 6-monthly-
-- checkpoint / referral-queue-jump design in
-- DayTickles_Founding_Member_Spec_v4.
--
-- v1 was schema-only and never wired to any app code (no references
-- to founding_activity_days, try_award_founding_member(), or
-- record_founding_activity() anywhere under app/, components/, lib/).
-- A live read-only check against production (2026-08-11) confirmed
-- founding_members_awarded_count = 0 and zero profiles rows have
-- founding_member_badge = true, so it's safe to remove outright
-- rather than leave a dead parallel system next to the new one.
-- =====================================================================

drop function if exists public.record_founding_activity(uuid, text);
drop function if exists public.try_award_founding_member(uuid);
drop table if exists public.founding_activity_days;

-- ---------------------------------------------------------------------
-- founding_member_slots
-- The 1000-number pool, one row per number, pre-seeded from
-- app_config.founding_members_cap. A plain counter (v1's approach)
-- can't support this design: a referral-earned number is *reserved*
-- ahead of completion, and if that person restarts, the number must
-- return to the pool for someone else to claim — i.e. allocation is
-- not strictly monotonic once reservations exist. This table is the
-- source of truth; app_config.founding_members_awarded_count (below)
-- is kept as a denormalized display cache only.
-- ---------------------------------------------------------------------
create table public.founding_member_slots (
  number       integer primary key,
  status       text not null default 'available'
                 check (status in ('available', 'reserved', 'granted')),
  user_id      uuid references public.profiles(id) on delete set null,
  reserved_at  timestamptz,
  granted_at   timestamptz
);

comment on table public.founding_member_slots is
  'Fixed pool of Founding Member numbers. available -> reserved happens on referral queue-jump lock; available/reserved -> granted happens on 6-month completion; reserved -> available happens if a locked reservation is forfeited via the one-time restart.';

create index idx_founding_member_slots_status on public.founding_member_slots (status);

alter table public.founding_member_slots enable row level security;

create policy "founding_member_slots are publicly readable"
  on public.founding_member_slots for select using (true);
-- No client write policy: writes only via security-definer functions
-- added in a later stage (atomic claim/reserve/release/grant).


-- ---------------------------------------------------------------------
-- founding_member_enrollment
-- One row per user who has ever started the quest. Tracks the current
-- (or only) attempt; the one-time month-1 restart is represented by
-- resetting attempt_started_at and bumping restart_count, rather than
-- a second row, since at most one attempt is ever "live" per user.
-- ---------------------------------------------------------------------
create table public.founding_member_enrollment (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  attempt_started_at  date not null default current_date,
  restart_count       integer not null default 0 check (restart_count in (0, 1)),
  status              text not null default 'active'
                        check (status in ('active', 'completed', 'failed')),
  completed_at        timestamptz,
  failed_at           timestamptz,
  created_at          timestamptz not null default now()
);

comment on column public.founding_member_enrollment.attempt_started_at is
  'Local calendar date (matches lib/week.js-style local-date handling, not UTC). Resets to the restart date if restart_count goes 0 -> 1.';
comment on column public.founding_member_enrollment.status is
  'failed is non-recoverable (restart already used, or a post-month-1 failure). completed means all 6 months passed in the current attempt.';

alter table public.founding_member_enrollment enable row level security;

create policy "users can view their own founding member enrollment"
  on public.founding_member_enrollment for select using (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- founding_member_month_result
-- Locked-in pass/fail per (user, attempt, month) once that month's
-- window has closed. attempt distinguishes the original run (1) from
-- the one-time restart (2), so a restart doesn't overwrite history.
-- ---------------------------------------------------------------------
create table public.founding_member_month_result (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  attempt       integer not null check (attempt in (1, 2)),
  month_index   integer not null check (month_index between 1 and 6),
  passed        boolean not null,
  evaluated_at  timestamptz not null default now(),
  primary key (user_id, attempt, month_index)
);

alter table public.founding_member_month_result enable row level security;

create policy "users can view their own founding member month results"
  on public.founding_member_month_result for select using (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- founding_member_referrals
-- referred_id is unique: a new user can be credited to exactly one
-- referrer (the manual code they entered at signup).
-- ---------------------------------------------------------------------
create table public.founding_member_referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references public.profiles(id) on delete cascade,
  referred_id  uuid not null unique references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index idx_founding_member_referrals_referrer on public.founding_member_referrals (referrer_id);

alter table public.founding_member_referrals enable row level security;

create policy "users can view referrals they made"
  on public.founding_member_referrals for select using (auth.uid() = referrer_id);


-- ---------------------------------------------------------------------
-- photo_share_events
-- Durable, server-side log of photo-share actions. NOT a replacement
-- for the local pinboard-*.db photo_shares table, which keeps its
-- existing role (photo metadata, caption, per-photo history) entirely
-- local by design. This table exists solely so a share *count* survives
-- a device change or reinstall -- necessary because this count can gate
-- a permanent, lifetime reward. Deliberately thin: no photo_id, no
-- caption, just "this user shared a photo at this time."
-- ---------------------------------------------------------------------
create table public.photo_share_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  shared_at  timestamptz not null default now()
);

create index idx_photo_share_events_user_time on public.photo_share_events (user_id, shared_at);

alter table public.photo_share_events enable row level security;

create policy "users can view their own photo share events"
  on public.photo_share_events for select using (auth.uid() = user_id);
create policy "users can record their own photo share events"
  on public.photo_share_events for insert with check (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- profiles: repurpose the v1 columns instead of adding parallel ones,
-- plus the new columns v2 needs.
-- ---------------------------------------------------------------------
alter table public.profiles
  rename column founding_member_badge to is_founding_member;
alter table public.profiles
  rename column founding_reward_granted_at to founding_member_granted_at;

comment on column public.profiles.is_founding_member is
  'True once the 6-month checkpoint quest is completed (original or the one-time restarted attempt). Grants a lifetime top-tier subscription. See founding_member_enrollment for in-progress state.';
comment on column public.profiles.founding_member_granted_at is
  'Set once, at the moment is_founding_member flips true.';

alter table public.profiles
  add column founding_member_number integer references public.founding_member_slots(number),
  add column founding_member_taking_part boolean not null default true,
  add column founding_member_reminders_enabled boolean not null default true,
  add column referral_code text unique;

comment on column public.profiles.founding_member_taking_part is
  '"Taking part" toggle on the FM page. Off just hides the FM page/icon and stops surfacing nudges -- progress keeps counting underneath regardless. Reversible any time.';
comment on column public.profiles.founding_member_reminders_enabled is
  'Home-screen pace-reminder toggle. Only meaningful when founding_member_taking_part is true.';
comment on column public.profiles.referral_code is
  'Unique manual-entry code for Refer a friend. Populated at signup (see handle_new_user()).';

create unique index idx_profiles_referral_code on public.profiles (referral_code) where referral_code is not null;


-- ---------------------------------------------------------------------
-- app_config: repurpose the v1 counters for the v2 numbered-slot pool.
-- founding_members_awarded_count now means "permanently granted count"
-- (kept in sync by the trigger below off founding_member_slots, since
-- it's a cheap public read for the FM page and shouldn't require every
-- client to COUNT(*) the slots table). founding_members_cap is the
-- configurable pool size used to seed founding_member_slots below --
-- raising it later means seeding more rows, not a schema change.
-- founding_member_promo_active is unchanged: still the single
-- program-wide on/off switch, same admin pattern as the seasonal
-- palette override.
-- ---------------------------------------------------------------------
alter table public.app_config
  alter column founding_members_cap set default 1000;

update public.app_config set founding_members_cap = 1000 where id = 1;

comment on column public.app_config.founding_members_cap is
  'Configurable size of the founding_member_slots pool. Raising it requires seeding additional slot rows (1..old_cap already exist), not a schema migration.';
comment on column public.app_config.founding_members_awarded_count is
  'Denormalized count of founding_member_slots rows with status = granted. Maintained by sync_founding_members_awarded_count() below -- do not write directly.';
comment on column public.app_config.founding_member_promo_active is
  'Program-wide kill switch. Off hides Founding Member surfaces app-wide; in-progress enrollments are unaffected (matches the taking-part toggle''s no-data-loss posture).';

insert into public.founding_member_slots (number)
select generate_series(1, (select founding_members_cap from public.app_config where id = 1))
on conflict (number) do nothing;

create or replace function public.sync_founding_members_awarded_count()
returns trigger
language plpgsql
security definer
as $$
begin
  if (tg_op = 'UPDATE' and old.status is distinct from new.status)
     or tg_op = 'INSERT' then
    update public.app_config
       set founding_members_awarded_count = (
         select count(*) from public.founding_member_slots where status = 'granted'
       )
     where id = 1;
  end if;
  return new;
end;
$$;

create trigger on_founding_member_slot_status_change
  after insert or update on public.founding_member_slots
  for each row execute function public.sync_founding_members_awarded_count();


-- ---------------------------------------------------------------------
-- handle_new_user(): extend the existing signup trigger (0001) to also
-- assign a referral code, rather than adding a second trigger on
-- auth.users. Format mirrors the existing placeholder-username
-- generation just above it.
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
  return new;
end;
$$;

