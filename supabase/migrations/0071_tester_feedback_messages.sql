-- 0071_tester_feedback_messages.sql
-- TEMPORARY (closed testing). Removed by a later drop migration before
-- public release -- see feedback_pill_audit.md section 9.
-- One optional message per day, shown at the top of the open
-- "Test ideas for today" panel.

create table if not exists public.feedback_day_messages (
  active_date date primary key,
  message     text not null check (char_length(message) between 1 and 300),
  created_at  timestamptz not null default now()
);
alter table public.feedback_day_messages enable row level security;
create policy "testers read day messages"
  on public.feedback_day_messages for select
  using (public.is_tester());
-- No insert/update/delete policies: messages are managed from the SQL editor.
