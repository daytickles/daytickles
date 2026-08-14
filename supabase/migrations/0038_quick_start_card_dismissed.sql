-- =====================================================================
-- DayTickles — Home's Quick Start onboarding card dismissal.
--
-- Plain permanent boolean, same shape as home_guide_seen (0005) /
-- rate_prompt_seen (0014) -- NOT founding_member_reminder_dismissed_at's
-- (0036) timestamp-vs-window shape, since this card has no recurring
-- window to re-arm against: once dismissed, it stays dismissed.
-- =====================================================================
alter table public.profiles
  add column if not exists quick_start_dismissed boolean not null default false;

comment on column public.profiles.quick_start_dismissed is
  'Set true when the user dismisses Home''s Quick Start onboarding card. Permanent -- unlike founding_member_reminder_dismissed_at, there is no recurring window to re-arm against.';
