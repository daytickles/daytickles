-- =====================================================================
-- DayTickles — Default "My Day" (day_journal_enabled) to ON
--
-- Was `default false` since its original migration (0011). Flipping to
-- true so new signups see the feature without a trip to Settings first.
-- Retroactive on purpose (not just a new-signup default) -- confirmed
-- acceptable: every current account is pre-launch test data that will
-- be removed before real launch, so there's no real user preference
-- being silently overridden here.
-- =====================================================================

alter table public.profiles alter column day_journal_enabled set default true;

update public.profiles set day_journal_enabled = true;
