-- =====================================================================
-- DayTickles -- migration: Awareness Cue multi-day batch redesign
--
-- Replaces daily regeneration with a 2-day batch model (see
-- DayTickles_Awareness_Cue_Multiday_Batch_Redesign_v1.md, audited
-- 2026-08-22): instead of requiring the app to run at least once per
-- day, a single generation covers AWARENESS_CUE_BATCH_DAYS days'
-- worth of local notifications at once (lib/reminders.js), and only
-- regenerates when that batch has genuinely expired or a preference
-- changes mid-batch (migration 0045's invalidation, reused unchanged
-- in mechanism, just updated below to target the new column).
--
-- awareness_cue_schedule_generated_on ("was today generated") becomes
-- awareness_cue_batch_valid_until ("the last day the current batch
-- covers") -- a real semantic shift, but the old value is exactly the
-- N=1 special case of the new one, so a straight copy-and-drop is a
-- correct backfill, not just a convenient one.
--
-- The server-side path (claim_due_awareness_cue_users) deliberately
-- stays single-day-at-a-time -- audited and confirmed as the simpler,
-- self-correcting choice: it now only matters for users who go longer
-- than the batch window without opening the app at all, and generating
-- one more day per claim is indistinguishable in effect from a matching
-- multi-day server batch (the same claim fires again next time it's
-- stale), without needing day-1-clamped/days-2+-full-window complexity
-- in a path whose whole point is now to matter rarely. The Edge
-- Function itself (supabase/functions/awareness-cue-dispatch/index.ts)
-- needs no changes -- it only consumes this RPC's returned columns,
-- which are unchanged in shape.
-- =====================================================================

alter table public.profiles
  add column if not exists awareness_cue_batch_valid_until date;

update public.profiles
  set awareness_cue_batch_valid_until = awareness_cue_schedule_generated_on
  where awareness_cue_schedule_generated_on is not null;

alter table public.profiles
  drop column if exists awareness_cue_schedule_generated_on;

comment on column public.profiles.awareness_cue_batch_valid_until is
  'Local calendar date (YYYY-MM-DD) of the last day the current Awareness Cue batch covers -- an idempotency/expiry marker, not a preference. Null until first generated. A still-valid batch (>= today) means neither the client (app/(tabs)/home.js) nor the server (claim_due_awareness_cue_users) regenerates; once it has passed, the next check (client open or server claim) generates a fresh batch. Reset to null when awareness_cue_enabled is turned off, or by invalidate_awareness_cue_schedule_for_today() on a mid-batch preference change.';

-- Updated claim condition: expired (or never generated) rather than
-- "not exactly today" -- the passive-expiry half of the redesign.
-- Still single-day per claim (see header comment): sets
-- awareness_cue_batch_valid_until to exactly today's date, not
-- today + N-1, so a still-absent user simply gets re-claimed on the
-- next stale check, and a user who returns mid-coverage hands back to
-- the client automatically via the same expiry check, symmetric in
-- both directions with no special handoff logic needed.
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
  set awareness_cue_batch_valid_until = due.local_today
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

comment on function public.claim_due_awareness_cue_users is
  'Called once per dispatch tick. Returns one row per user whose local window is open today and whose batch has expired (or never existed) -- claimed atomically the same way as before. Generates exactly one day''s worth server-side, deliberately not matching the client''s multi-day batch length -- see this migration''s header comment for why.';

-- Same mechanism as migration 0045, updated to target the renamed
-- column -- callers (app/settings.js) are unaffected, same name/signature.
create or replace function public.invalidate_awareness_cue_schedule_for_today()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set awareness_cue_batch_valid_until = null
  where id = auth.uid();

  delete from public.awareness_cue_scheduled_pushes
  where user_id = auth.uid()
    and delivered_at is null;
$$;

comment on function public.invalidate_awareness_cue_schedule_for_today() is
  'Called by app/settings.js whenever the user changes their Awareness Cue type, frequency mode, count, or window mid-batch. Clears the current batch''s validity marker (so both the client and server regeneration paths correctly treat it as expired and generate a fresh batch under the new settings) and removes any of the caller''s own already-queued, undelivered server-side rows. SECURITY DEFINER so it can reach the service-role-only awareness_cue_scheduled_pushes table; scoped entirely by auth.uid(), never a client-supplied id.';
