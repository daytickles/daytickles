-- =====================================================================
-- Founding Member program v2 — Stage 6 (FM page UI) support column.
--
-- Same pattern as home_guide_seen (0005): a plain boolean gate so the
-- non-recoverable-failure closing message ("This opportunity has
-- closed for now...") shows exactly once, not as a repeating nag.
-- Unlike home_guide_seen, there's no "reachable again on demand" path
-- for this one -- once seen, the FM nav icon (components/CornerNav.js)
-- hides for good, matching the spec's "the FM page and its nav icon
-- quietly disappear" on failure.
-- =====================================================================

alter table public.profiles
  add column if not exists founding_member_failure_message_seen boolean not null default false;

comment on column public.profiles.founding_member_failure_message_seen is
  'Gates the one-time closing message shown after a non-recoverable Founding Member failure. Once true, the FM nav icon stays hidden permanently.';
