-- =====================================================================
-- DayTickles -- migration: Awareness Cue batch source tracking
--
-- Diagnostic-only addition (2026-08-22): awareness_cue_batch_source
-- records which path (client or server) generated the current batch,
-- since both paths write awareness_cue_batch_valid_until with no other
-- record of which one actually did it. Surfaced in Settings as a
-- clearly-labeled testing-only diagnostic, not a real user-facing
-- feature -- see app/settings.js.
--
-- Always written/cleared together with awareness_cue_batch_valid_until,
-- at all four of its existing write sites, never independently:
--   - claim_due_awareness_cue_users() (server claim) -- sets 'server'
--   - app/(tabs)/home.js's regeneration success path (client) -- sets 'client'
--   - app/(tabs)/home.js's disable-path cleanup -- clears both
--   - invalidate_awareness_cue_schedule_for_today() (mid-batch settings
--     change) -- clears both
-- This avoids a stale source label surviving past the batch it
-- actually describes (e.g. showing "server" after the feature's been
-- toggled off and back on, or after a setting change invalidated the
-- batch that label referred to).
-- =====================================================================

alter table public.profiles
  add column if not exists awareness_cue_batch_source text
  check (awareness_cue_batch_source in ('client', 'server'));

comment on column public.profiles.awareness_cue_batch_source is
  'Diagnostic only, not a preference -- which path (client app/(tabs)/home.js, or server claim_due_awareness_cue_users) generated the current batch. Null whenever awareness_cue_batch_valid_until is null; the two columns are always written/cleared together, never independently. Surfaced in Settings as a clearly-labeled testing-only display.';

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
  set awareness_cue_batch_valid_until = due.local_today,
      awareness_cue_batch_source = 'server'
  from due
  where p.id = due.id
    and (p.awareness_cue_batch_valid_until is null or p.awareness_cue_batch_valid_until < due.local_today)
  returning
    p.id as user_id,
    due.awareness_cue_type as cue_type,
    due.awareness_cue_frequency_mode as frequency_mode,
    due.awareness_cue_count as count,
    now() as now_utc,
    ((due.local_today + (due.awareness_cue_window_end_minute || ' minutes')::interval) at time zone due.timezone) as window_end_utc,
    due.local_today as for_date;
$$;

create or replace function public.invalidate_awareness_cue_schedule_for_today()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set awareness_cue_batch_valid_until = null,
      awareness_cue_batch_source = null
  where id = auth.uid();

  delete from public.awareness_cue_scheduled_pushes
  where user_id = auth.uid()
    and delivered_at is null;
$$;
