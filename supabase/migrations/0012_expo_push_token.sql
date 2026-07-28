-- =====================================================================
-- Adds storage for each profile's current device push token, so a
-- future push backend (e.g. for profiles.notify_on_likes) has somewhere
-- to send to. Nullable: not every signed-in user has granted
-- notification permission or has push capability (simulators, Expo Go).
-- One token per profile — the client overwrites it on every sign-in/
-- launch, so it always reflects the most recently active device.
-- =====================================================================

alter table public.profiles
  add column expo_push_token text;
