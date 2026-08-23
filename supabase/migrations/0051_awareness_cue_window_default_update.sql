-- =====================================================================
-- Awareness Cue -- window column defaults follow the Daytime preset's
-- updated values.
--
-- app/settings.js's Daytime preset moved from 9:00 AM-9:00 PM (540-1260
-- minutes) to 7:00 AM-7:00 PM (420-1140) -- All day also moved, from
-- 7:00 AM-11:00 PM to 6:00 AM-11:00 PM (360-1380), but that one isn't
-- the default preset and doesn't drive these column defaults.
--
-- profiles.awareness_cue_window_start_minute/_end_minute default to
-- 540/1260 since migration 0042, deliberately matching Daytime so a
-- never-touched profile always renders a real, recognized preset
-- selection rather than a blank/custom state (see the client-side
-- comment in app/settings.js). Updated here to 420/1140 to keep that
-- invariant true now that Daytime itself has moved.
--
-- Deliberately does NOT touch any existing row's current values --
-- only affects the default applied on insert (new signups); same
-- non-destructive posture as migration 0050.
-- =====================================================================

alter table public.profiles
  alter column awareness_cue_window_start_minute set default 420;

alter table public.profiles
  alter column awareness_cue_window_end_minute set default 1140;
