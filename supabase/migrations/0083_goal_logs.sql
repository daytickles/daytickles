-- 0083_goal_logs.sql
-- "Nailed it!": tapping a token-earning Goal on Home gives +1 token and
-- writes NO Tickle. One row here per tap; an AFTER INSERT trigger writes
-- the token_events row (like quick_quests in 0082). Tokens are never
-- taken back, so there is no update or delete policy. Deleting a Goal or
-- an account deletes these rows (cascade); earned tokens stay in
-- token_events. Like Goal tagging and Quick Quest, the trigger does not
-- read profiles.tokens_enabled: the app hides the button when tokens
-- are off.

create table public.goal_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  goal_id    uuid not null references public.goals(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index goal_logs_goal_created_idx on public.goal_logs (goal_id, created_at desc);
create index goal_logs_user_idx on public.goal_logs (user_id);

alter table public.goal_logs enable row level security;

create policy goal_logs_select_own on public.goal_logs
  for select to authenticated
  using (auth.uid() = user_id);

-- Only your own, active (not Achieved) Goal that earns tokens.
create policy goal_logs_insert_own on public.goal_logs
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.goals g
      where g.id = goal_id
        and g.user_id = auth.uid()
        and g.earns_tokens
        and g.achieved_at is null
    )
  );

revoke all on public.goal_logs from anon;
revoke all on public.goal_logs from authenticated;
grant select, insert on public.goal_logs to authenticated;

alter table public.token_events
  add column goal_log_id uuid references public.goal_logs(id) on delete set null;

create or replace function public.award_token_on_goal_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.token_events (user_id, delta, reason, goal_id, goal_log_id)
  values (new.user_id, 1, 'goal_log', new.goal_id, new.id);
  return new;
end;
$$;

revoke execute on function public.award_token_on_goal_log() from public, anon, authenticated;

create trigger award_token_on_goal_log
  after insert on public.goal_logs
  for each row execute function public.award_token_on_goal_log();
