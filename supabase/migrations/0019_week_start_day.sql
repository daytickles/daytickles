-- =====================================================================
-- DayTickles — migration: configurable week-start day
-- Lets someone choose which day their "week" starts on (Settings ->
-- "Week starts on"), rather than every weekly stat in the app being
-- silently hardcoded to Monday. Powers lib/week.js's
-- currentWeekStartDate/currentWeekStartISO/isThisWeek (Home's Weekly
-- Tickles/Weekly likes given/Weekly Vibes, and the new Weekly Summary
-- screen) -- one consistent definition of "this week" everywhere, not
-- per-screen. 0=Sunday..6=Saturday, matching JS's own Date.getDay() so
-- no translation layer is needed between the DB and lib/week.js.
-- =====================================================================

alter table public.profiles
  add column if not exists week_start_day smallint not null default 1
  check (week_start_day between 0 and 6);

comment on column public.profiles.week_start_day is
  'Day the user''s "week" starts on, 0=Sunday..6=Saturday (matches JS Date.getDay()). Default 1 (Monday) matches the app''s prior hardcoded behavior.';
