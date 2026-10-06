-- 0070_tester_feedback.sql
-- TEMPORARY (closed testing). Removed by a later drop migration before
-- public release -- see feedback_pill_audit.md section 9.
-- Tasks are dated rows: one feedback_tasks row per task per day.

-- Who counts as a tester. No insert/update/delete policies: rows are added
-- only from the SQL editor / service role, so a user can never self-grant.
create table if not exists public.testers (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.testers enable row level security;
create policy "testers read own row"
  on public.testers for select using (auth.uid() = user_id);

create or replace function public.is_tester()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.testers where user_id = auth.uid());
$$;

create table if not exists public.feedback_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  detail      text check (detail is null or char_length(detail) <= 400),
  active_date date,                     -- null = shown every day while active
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.feedback_tasks enable row level security;
create policy "testers read active tasks"
  on public.feedback_tasks for select
  using (is_active and public.is_tester());
-- No insert/update/delete policies: tasks are managed from the SQL editor.

create table if not exists public.feedback_answers (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.feedback_tasks(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  answer     text not null check (answer in ('worked', 'problem', 'skipped')),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists idx_feedback_answers_user on public.feedback_answers (user_id);
alter table public.feedback_answers enable row level security;

-- Own rows only. Nobody (other than the service role / SQL editor) reads
-- anyone else's answers.
create policy "testers read own answers"
  on public.feedback_answers for select
  using (auth.uid() = user_id);
create policy "testers insert own answers"
  on public.feedback_answers for insert
  with check (
    auth.uid() = user_id and public.is_tester()
    and exists (select 1 from public.feedback_tasks t where t.id = task_id and t.is_active)
  );
create policy "testers update own answers"
  on public.feedback_answers for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and public.is_tester()
    and exists (select 1 from public.feedback_tasks t where t.id = task_id and t.is_active)
  );
-- No delete policy: an answer can be changed, not cleared back to pending.

create or replace function public.touch_feedback_answer()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger feedback_answers_touch
  before update on public.feedback_answers
  for each row execute function public.touch_feedback_answer();
