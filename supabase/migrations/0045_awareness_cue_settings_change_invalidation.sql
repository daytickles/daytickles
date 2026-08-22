-- =====================================================================
-- DayTickles -- migration: mid-day Awareness Cue settings-change
-- invalidation
--
-- Fixes a real bug found 2026-08-22: awareness_cue_schedule_generated_on
-- is a single marker shared by BOTH the client-side path (app/(tabs)/
-- home.js) and the server-side path (claim_due_awareness_cue_users,
-- migration 0043) -- once either path has generated a schedule for
-- "today", changing type/frequency mode/count/window mid-day silently
-- did nothing until the next calendar day, since neither path re-checks
-- whether the actual generated schedule still matches current settings,
-- only whether *a* schedule was generated today at all.
--
-- Fix: app/settings.js calls this function whenever one of those four
-- preference fields actually changes. Both existing regeneration paths
-- already treat a null marker exactly like "not generated yet today" --
-- neither needs any change of its own. This function just:
--   (a) nulls the shared marker, and
--   (b) deletes the caller's own already-generated, not-yet-delivered
--       server-side rows for today, so a stale pre-change batch can't
--       coexist with a fresh client-side regeneration and produce
--       duplicate cues.
--
-- SECURITY DEFINER, not a broad RLS policy: awareness_cue_scheduled_pushes
-- is deliberately service-role-only (see 0043's own comment, zero
-- policies) -- this function is a narrow, single-purpose privileged
-- operation instead, same pattern already used by founding_activity_days
-- in this schema ("writes only happen [via security definer]... so no
-- direct insert policy is needed"). Scoped entirely by auth.uid()
-- internally, never a client-supplied id, so an authenticated caller
-- can only ever affect their own row(s).
-- =====================================================================

create or replace function public.invalidate_awareness_cue_schedule_for_today()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set awareness_cue_schedule_generated_on = null
  where id = auth.uid();

  delete from public.awareness_cue_scheduled_pushes
  where user_id = auth.uid()
    and delivered_at is null;
$$;

comment on function public.invalidate_awareness_cue_schedule_for_today() is
  'Called by app/settings.js whenever the user changes their Awareness Cue type, frequency mode, count, or window mid-day. Clears the shared awareness_cue_schedule_generated_on marker (so both the client and server regeneration paths correctly treat today as "not yet generated" again) and removes any of the caller''s own already-queued, undelivered server-side rows for today. SECURITY DEFINER so it can reach the service-role-only awareness_cue_scheduled_pushes table; scoped entirely by auth.uid(), never a client-supplied id -- an authenticated caller can only ever affect their own data.';

revoke all on function public.invalidate_awareness_cue_schedule_for_today() from public;
grant execute on function public.invalidate_awareness_cue_schedule_for_today() to authenticated;
