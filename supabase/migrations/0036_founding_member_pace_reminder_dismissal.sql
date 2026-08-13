-- =====================================================================
-- Founding Member — Home pace-reminder dismissal (Stage 8).
--
-- Single timestamp, not a per-month/attempt row: the Home banner's
-- "dismissed" check is dismissed_at >= current checkpoint window's
-- start (see lib/foundingMember.js's fetchFoundingMemberPaceStatus).
-- That comparison alone makes a dismissal self-expire correctly at
-- the next month's checkpoint (whose startISO is always later than
-- any dismissal timestamp from the prior window) and across a restart
-- (attempt_started_at resets forward too) -- no separate month_index/
-- attempt bookkeeping needed for what is otherwise just "did they
-- already dismiss this for the window they're currently in".
-- =====================================================================
alter table public.profiles
  add column founding_member_reminder_dismissed_at timestamptz;

comment on column public.profiles.founding_member_reminder_dismissed_at is
  'Set when the user dismisses Home''s Founding Member pace-reminder banner. Compared against the current checkpoint window''s start to decide whether the dismissal still applies -- see fetchFoundingMemberPaceStatus in lib/foundingMember.js.';
