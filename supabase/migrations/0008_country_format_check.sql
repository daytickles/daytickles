-- =====================================================================
-- DayTickles — migration: enforce profiles.country format
-- country has existed since 0001 as a plain nullable text column — the
-- 2-letter-code expectation ('ES', 'JP', etc.) was only ever documented
-- in a comment, never enforced, so nothing stopped a wrong-shaped value
-- (lowercase, a full country name, wrong length) from being written and
-- silently breaking whatever eventually renders a flag from it.
--
-- Confirmed live via anon-key probe before writing this: all 4 existing
-- profiles have country = null, so this constraint applies cleanly with
-- no pre-existing data to clean up first (unlike 0006's self-likes).
-- Null stays allowed — "prefer not to say" per daytickles-spec.md.
-- =====================================================================

alter table public.profiles
  add constraint profiles_country_format
  check (country is null or country ~ '^[A-Z]{2}$');
