-- =====================================================================
-- DayTickles — Day Dots
--
-- A lightweight, unlabeled daily check-in bundled into the existing
-- evening reminder (profiles.daily_reminder) -- no separate toggle.
-- Deliberately NOT a Tickle: no row in tickle_entries, no goal/vibe
-- tagging, never shown to anyone but the owner, never appears in the
-- Feed/Calendar/Vibe system at all. Its only surface is a Home card
-- (while unanswered) and a new Weekly Summary section (once answered).
--
-- prompt_date is the ORIGINAL evening a prompt was meant for, not the
-- date it was actually tapped/skipped -- someone who forgot last night
-- and answers today still logs against last night's date, so Weekly
-- Summary's day-by-day view stays accurate. Only the single most
-- recent unanswered date is ever eligible to be shown/answered (see
-- lib/reminders.js's currentDayDotsPromptDate) -- older missed dates
-- are never queried again once a newer one supersedes them, so they
-- quietly fade away without any explicit cleanup needed here.
--
-- status distinguishes a genuine dot choice from a no-pressure skip --
-- skipped rows exist purely so the prompt doesn't reappear later the
-- same evening, and are deliberately excluded from every Weekly
-- Summary query (see app/weekly-summary.js) so a skip really does
-- carry no visible trace, matching this app's existing dismissible-UI
-- pattern (e.g. QuickStartCard) in spirit if not in exact mechanism.
--
-- No visibility/public concept at all here, unlike tickle_entries --
-- this is never shown to any other user, so RLS only needs owner-
-- scoped policies, one per CRUD verb actually used (no update: once a
-- date has a row, answered or skipped, it's resolved for good).
-- =====================================================================

create table public.day_dots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  prompt_date  date not null,
  status       text not null check (status in ('answered', 'skipped')),
  dot_index    smallint check (dot_index between 0 and 2),
  answered_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  check (
    (status = 'answered' and dot_index is not null) or
    (status = 'skipped' and dot_index is null)
  ),
  unique (user_id, prompt_date)
);

comment on column public.day_dots.prompt_date is
  'The evening this prompt was originally for (local calendar date) -- never the date it was actually answered/skipped. Late answers still log against this original date so Weekly Summary stays accurate.';
comment on column public.day_dots.status is
  '''skipped'' rows exist only so the prompt does not reappear -- deliberately excluded from every Weekly Summary query, carrying no visible trace, matching the no-pressure skip design.';
comment on column public.day_dots.dot_index is
  'Which of the 3 unlabeled dots (0-2), only set when status = answered. No stated meaning app-side -- purely the users own private association.';
comment on column public.day_dots.answered_at is
  'When the user actually interacted (tap or skip) -- diagnostic only, never used to decide which prompt is currently eligible (see lib/reminders.js currentDayDotsPromptDate, which keys off prompt_date vs. today/yesterday, not this column).';

alter table public.day_dots enable row level security;

create policy "users can view their own day dots"
  on public.day_dots for select
  using (auth.uid() = user_id);

create policy "users can insert their own day dots"
  on public.day_dots for insert
  with check (auth.uid() = user_id);

create policy "users can delete their own day dots"
  on public.day_dots for delete
  using (auth.uid() = user_id);
