-- =====================================================================
-- DayTickles — migration: Awareness Cue preferences
--
-- Awareness Cue: a private, contentless vibration or sound burst fired
-- a few times a day at random moments within a user-chosen time window
-- -- a personal cue to pause and notice a possible "vibe" moment
-- happening right now, with zero expected response. Feasibility proven
-- 2026-08-21 (commits ad409c1, 30155df, 5840b9c -- channel/sound setup,
-- the channel-lock fix, and the real root cause of that night's silent-
-- notification investigation, a missing global setNotificationHandler).
-- This migration adds the real preference columns backing the actual
-- feature; see lib/reminders.js for the scheduling logic and
-- app/(tabs)/home.js for the once-per-local-day regeneration hook.
--
-- awareness_cue_schedule_generated_on is not a user preference -- it's
-- an idempotency marker so opening the app repeatedly in one day
-- doesn't keep re-randomizing (and re-cancelling already-fired) cues.
-- Stored server-side rather than on-device (e.g. SecureStore) for the
-- same reason every other piece of this app's state is server-side:
-- consistent behavior across reinstalls/devices, not because it's
-- synced content in its own right.
-- =====================================================================

alter table public.profiles
  add column if not exists awareness_cue_enabled boolean not null default false;

comment on column public.profiles.awareness_cue_enabled is
  'Master toggle for the Awareness Cue feature. Off by default -- opt-in.';

alter table public.profiles
  add column if not exists awareness_cue_type text not null default 'vibrate'
  check (awareness_cue_type in ('vibrate', 'sound'));

comment on column public.profiles.awareness_cue_type is
  'Which cue the user gets: a vibration burst or the custom "psst" sound (assets/sounds/psst.wav). Mutually exclusive by design, not both at once.';

alter table public.profiles
  add column if not exists awareness_cue_frequency_mode text not null default 'loose'
  check (awareness_cue_frequency_mode in ('exact', 'loose'));

comment on column public.profiles.awareness_cue_frequency_mode is
  '''exact'' uses awareness_cue_count as a precise daily count; ''loose'' lets the app pick a count each day within its own hardcoded bounds (LOOSE_MODE_MIN/MAX_COUNT in lib/reminders.js) -- not user-configurable.';

alter table public.profiles
  add column if not exists awareness_cue_count smallint
  check (awareness_cue_count between 1 and 10);

comment on column public.profiles.awareness_cue_count is
  'Precise daily cue count, only meaningful when awareness_cue_frequency_mode = ''exact''. Null otherwise.';

alter table public.profiles
  add column if not exists awareness_cue_window_start_minute smallint not null default 540
  check (awareness_cue_window_start_minute between 0 and 1439);

alter table public.profiles
  add column if not exists awareness_cue_window_end_minute smallint not null default 1260
  check (awareness_cue_window_end_minute between 0 and 1439);

alter table public.profiles
  add constraint profiles_awareness_cue_window_valid
  check (awareness_cue_window_end_minute > awareness_cue_window_start_minute);

comment on column public.profiles.awareness_cue_window_start_minute is
  'Start of the daily window cues can fire in, minutes since local midnight (0-1439). Default 540 = 9:00am.';

comment on column public.profiles.awareness_cue_window_end_minute is
  'End of the daily window cues can fire in, minutes since local midnight (0-1439), enforced greater than the start by profiles_awareness_cue_window_valid. Default 1260 = 9:00pm. Both columns are wall-clock local time, chosen and interpreted entirely client-side -- no timezone conversion happens server-side.';

alter table public.profiles
  add column if not exists awareness_cue_schedule_generated_on date;

comment on column public.profiles.awareness_cue_schedule_generated_on is
  'Local calendar date (YYYY-MM-DD) today''s random cue schedule was last generated for -- an idempotency marker, not a preference. Null until first generated; reset to null when awareness_cue_enabled is turned off. See app/(tabs)/home.js.';
