-- =====================================================================
-- DayTickles -- migration: Awareness Cue sound-confirmation fallback
--
-- ColorOS/Oppo-specific finding, 2026-08-22 (see backlog): the custom
-- "psst" sound cue is confirmed correctly configured at the engine
-- level (getNotificationChannelsAsync reports it correctly) but does
-- not audibly play on at least one real test device, with no
-- documented OEM cause found despite real research. Rather than keep
-- chasing the root cause, Awareness Cue now confirms the sound
-- actually plays on each device at selection time (a "Did you hear
-- it?" test-cue prompt, app/settings.js) and falls back to the
-- phone's own default notification sound when it doesn't. Re-checked
-- every time "Sound" is (re)selected, not stored as a one-time result.
-- =====================================================================

alter table public.profiles
  add column if not exists awareness_cue_sound_confirmed boolean;

comment on column public.profiles.awareness_cue_sound_confirmed is
  'Result of the "Did you hear it?" test-cue prompt shown every time Sound is (re)selected as the Awareness Cue type. Only meaningful when awareness_cue_type = ''sound''. NULL is treated identically to FALSE by both the client (lib/reminders.js) and server (supabase/functions/awareness-cue-dispatch) dispatch paths -- an untested or interrupted confirmation falls back to the device''s default notification sound (a third channel, awareness-cue-sound-default) rather than assuming the custom psst.wav sound works.';
