-- =====================================================================
-- DayTickles — migration: update home_guide_seen's DB comment
-- Home's auto-shown first-time intro now shows AboutModal (with an
-- optional link into HomeGuide as a follow-up) instead of HomeGuide
-- directly — see the onboarding-guide-swap conversation. The column
-- itself, its semantics, and every other behavior are unchanged; this
-- only corrects the comment, which still described the pre-swap
-- content and would otherwise mislead anyone reading the schema later.
-- =====================================================================

comment on column public.profiles.home_guide_seen is
  'Whether the person has been auto-shown their first-time intro (currently About DayTickles).';
