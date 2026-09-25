-- =====================================================================
-- DayTickles — migration: freemium weekly soft-cap counters
-- Adds: feature_usage, one row per (user, capped feature), holding
-- that feature's count for the calendar week that starts on
-- period_start (local 'YYYY-MM-DD', per profiles.week_start_day -- see
-- lib/week.js currentWeekStartDate). The client treats a row whose
-- period_start isn't the current week's start as count 0, then
-- overwrites it on the next use -- same "counter + period-start"
-- shape the old profiles.share_period_start / share_count_this_period
-- pair used, just one row per feature instead of two columns each.
--
-- Replaces profiles.share_period_start / share_count_this_period as
-- the Polaroid/external-share cap's storage (feature =
-- 'polaroidExternalShare'). Those two columns are deliberately left in
-- place, unused -- dropping them is a separate later cleanup.
--
-- Feature ids are the keys of WEEKLY_CAPS in lib/freemiumCaps.js. No
-- check constraint on them, so adding a new capped feature later is a
-- client-only change, not another migration.
--
-- Soft caps, enforced client-side, same as the old share cap -- the
-- owner-only policy below lets a user write their own counter.
-- =====================================================================
create table if not exists public.feature_usage (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  feature       text not null,
  period_start  date not null,
  count         integer not null default 0 check (count >= 0),
  primary key (user_id, feature)
);

alter table public.feature_usage enable row level security;

drop policy if exists "users manage their own feature usage" on public.feature_usage;
create policy "users manage their own feature usage"
  on public.feature_usage for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
