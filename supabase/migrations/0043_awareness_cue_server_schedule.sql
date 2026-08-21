-- =====================================================================
-- DayTickles -- migration: Awareness Cue server-side schedule
--
-- Adds the server-side half of Awareness Cue's hybrid architecture
-- (concept spec + feasibility/audit, 2026-08-22). The client-side path
-- (lib/reminders.js's regenerateAwarenessCueSchedule, gated in
-- app/(tabs)/home.js) is unchanged and remains the default, free path
-- for any day the app is actually opened. This migration only adds
-- what's needed for the days it genuinely isn't: a place to queue
-- server-computed cue times, and a way to know each user's local time
-- server-side (previously nowhere in this schema -- every existing
-- "local date" computation in this app, e.g. lib/week.js, is done
-- entirely on-device).
--
-- Design notes:
-- - profiles.awareness_cue_schedule_generated_on (0042) is reused
--   as-is as the single idempotency marker shared by BOTH paths --
--   whichever path (client or server) sets it first for a given local
--   day "owns" the rest of that day; see claim_due_awareness_cue_users
--   below for how the server path claims it atomically.
-- - scheduled_at is timestamptz (a real UTC instant), not a local
--   wall-clock time -- unlike the window-minute columns on profiles,
--   this table is only ever read/written server-side, so there's no
--   reason to defer timezone interpretation the way the client-facing
--   preference columns do.
-- - awareness_cue_type is snapshotted per-row at generation time so a
--   mid-day settings change can't retroactively alter already-computed
--   rows for today.
-- =====================================================================

alter table public.profiles
  add column if not exists timezone text;

comment on column public.profiles.timezone is
  'IANA timezone name (e.g. "Pacific/Auckland"), from Intl.DateTimeFormat().resolvedOptions().timeZone on-device. Null until the client writes it at least once (see lib/pushToken.js-style opportunistic registration). Required for the Awareness Cue server-side path (claim_due_awareness_cue_users below) to run for a user at all -- without it, that user is simply skipped server-side and continues to rely entirely on the client-side path. Trusted as-supplied (a real IANA name by construction, given how it is produced) -- not validated against pg_timezone_names.';

create table if not exists public.awareness_cue_scheduled_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cue_type text not null check (cue_type in ('vibrate', 'sound')),
  for_date date not null,
  scheduled_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.awareness_cue_scheduled_pushes is
  'Server-computed Awareness Cue times awaiting push delivery -- only populated for a user on a day the client-side path (app/(tabs)/home.js) did not already handle by the time their local window opened. Rows are generated and consumed entirely by the awareness-cue-dispatch Edge Function; nothing in the app reads this table directly.';

comment on column public.awareness_cue_scheduled_pushes.for_date is
  'The user''s local calendar date (per profiles.timezone) this row''s batch was generated for -- matches profiles.awareness_cue_schedule_generated_on for that user on that day.';

comment on column public.awareness_cue_scheduled_pushes.delivered_at is
  'Set once a send has been attempted (successful or not -- delivery is best-effort, same philosophy as notify-on-like) or once a row is skipped for being too stale (see the dispatch function''s cutoff). Null = still due.';

-- The dispatch function's every-tick query: "what's due and unsent".
create index if not exists awareness_cue_scheduled_pushes_due_idx
  on public.awareness_cue_scheduled_pushes (scheduled_at)
  where delivered_at is null;

alter table public.awareness_cue_scheduled_pushes enable row level security;

-- No policies: this table is only ever touched by the dispatch Edge
-- Function's service-role client, which bypasses RLS entirely (same
-- pattern notify-on-like already relies on for profiles/tickle_entries
-- reads). RLS is enabled anyway as a default-deny backstop -- no
-- anon/authenticated-role access is ever intended, so there is nothing
-- to write a policy for.

-- Atomically claims users whose local Awareness Cue window has opened
-- today and who have not already been handled (by either path) today.
-- "Atomic" matters here: this UPDATE...RETURNING is the entire
-- claim -- a row only comes back if this call is the one that flipped
-- awareness_cue_schedule_generated_on for that user just now, so two
-- overlapping dispatch runs (or a run overlapping a user opening the
-- app at the same moment) can't both claim the same user's day.
--
-- window_end_utc is computed here (not in the caller) because only
-- SQL's AT TIME ZONE has a simple, correct way to convert a user's
-- local wall-clock window-end back into a real UTC instant.
create or replace function public.claim_due_awareness_cue_users()
returns table (
  user_id uuid,
  cue_type text,
  frequency_mode text,
  count smallint,
  now_utc timestamptz,
  window_end_utc timestamptz,
  for_date date
)
language sql
as $$
  with local_times as (
    select
      p.id,
      p.timezone,
      p.awareness_cue_type,
      p.awareness_cue_frequency_mode,
      p.awareness_cue_count,
      p.awareness_cue_window_start_minute,
      p.awareness_cue_window_end_minute,
      (now() at time zone p.timezone) as local_now
    from public.profiles p
    where p.awareness_cue_enabled
      and p.timezone is not null
      and p.expo_push_token is not null
  ),
  eligible as (
    select
      *,
      local_now::date as local_today,
      (extract(hour from local_now)::int * 60 + extract(minute from local_now)::int) as local_minute
    from local_times
  ),
  due as (
    select *
    from eligible
    where local_minute >= awareness_cue_window_start_minute
      and local_minute < awareness_cue_window_end_minute
  )
  update public.profiles p
  set awareness_cue_schedule_generated_on = due.local_today
  from due
  where p.id = due.id
    and p.awareness_cue_schedule_generated_on is distinct from due.local_today
  returning
    p.id as user_id,
    due.awareness_cue_type as cue_type,
    due.awareness_cue_frequency_mode as frequency_mode,
    due.awareness_cue_count as count,
    now() as now_utc,
    ((due.local_today + (due.awareness_cue_window_end_minute || ' minutes')::interval) at time zone due.timezone) as window_end_utc,
    due.local_today as for_date;
$$;

comment on function public.claim_due_awareness_cue_users is
  'Called once per dispatch tick. Returns one row per user who is newly claimed for server-side generation this call (local window open, not yet handled today by either path) -- the caller (awareness-cue-dispatch Edge Function) then computes and inserts that user''s actual scheduled_at rows into awareness_cue_scheduled_pushes.';
