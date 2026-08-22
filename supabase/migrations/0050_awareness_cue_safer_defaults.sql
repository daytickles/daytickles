-- =====================================================================
-- Awareness Cue -- defensive re-assertion of safe defaults.
--
-- awareness_cue_enabled/awareness_cue_type were already defined as
-- default false / default 'vibrate' in migration 0042, and no later
-- migration has changed either -- confirmed by grepping every
-- migration file. This exists only as a defensive re-assertion in case
-- the live database's actual column defaults have drifted from this
-- repo's migration history (this project applies migrations by hand
-- through the Supabase dashboard, so that can't be ruled out from code
-- alone). A no-op if live already matches; corrective if it doesn't.
--
-- Deliberately does NOT touch any existing row's current values --
-- only affects the default applied to a column when no value is
-- supplied at insert time (i.e. new signups). Never overwrites a real
-- user's already-set enabled/type preference.
-- =====================================================================

alter table public.profiles
  alter column awareness_cue_enabled set default false;

alter table public.profiles
  alter column awareness_cue_type set default 'vibrate';
