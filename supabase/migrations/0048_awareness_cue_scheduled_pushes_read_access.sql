-- =====================================================================
-- DayTickles -- migration: read-only accessor for a user's own scheduled
-- Awareness Cue pushes
--
-- Diagnostic-only addition (2026-08-23): lets the client read back its
-- own undelivered awareness_cue_scheduled_pushes rows, for the Settings
-- diagnostic display (app/settings.js) to show actual scheduled times
-- alongside the client-side (on-device) schedule. No existing policy
-- allows this -- awareness_cue_scheduled_pushes intentionally has no
-- RLS policies at all (0043), since only the dispatch Edge Function's
-- service-role client was ever expected to touch it. Same
-- SECURITY DEFINER + auth.uid()-scoping pattern as
-- invalidate_awareness_cue_schedule_for_today (0047): reaches the
-- service-role-only table without opening a broad policy, and can only
-- ever return the caller's own rows.
-- =====================================================================

create or replace function public.get_my_scheduled_awareness_cue_pushes()
returns table (scheduled_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select scheduled_at
  from public.awareness_cue_scheduled_pushes
  where user_id = auth.uid()
    and delivered_at is null
  order by scheduled_at;
$$;

comment on function public.get_my_scheduled_awareness_cue_pushes is
  'Diagnostic-only accessor for app/settings.js -- returns the calling user''s own undelivered awareness_cue_scheduled_pushes.scheduled_at rows. SECURITY DEFINER so it can reach the service-role-only table (0043); scoped entirely by auth.uid(), never a client-supplied id.';
