-- =====================================================================
-- DayTickles — migration: Goals feature
-- Run this AFTER the original schema (safe to run once against a
-- database that already has profiles / tickle_entries / etc.).
-- Adds: the goals table, a goal_id column on tickle_entries, a
-- database-level 5-goal cap, and RLS for goals.
-- =====================================================================

-- =====================================================================
-- goals
-- Personal categories a person wants to notice more positivity in
-- (e.g. "Travel to work"). Purely personal — never shown to anyone
-- else, unlike everything else with a color in this app.
-- =====================================================================
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 60),
  color       text not null,        -- hex string; client offers a fixed small palette, not a free color picker
  created_at  timestamptz not null default now()
);

create index if not exists idx_goals_user on public.goals (user_id);

-- The Expo app already caps this at 5 client-side, but RLS-protected
-- tables are reachable directly by any authenticated client (that's
-- the whole point of Supabase's API model) — so the real limit needs
-- to live here too, not only in app code that a modified client could
-- skip entirely.
create or replace function public.enforce_goal_cap()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.goals where user_id = new.user_id) >= 5 then
    raise exception 'Goal limit reached (5 max)';
  end if;
  return new;
end;
$$;

drop trigger if exists check_goal_cap on public.goals;
create trigger check_goal_cap
  before insert on public.goals
  for each row execute function public.enforce_goal_cap();


-- =====================================================================
-- tickle_entries.goal_id
-- Nullable, one goal per entry. ON DELETE SET NULL — deleting a goal
-- clears the tag rather than orphaning the entry or blocking the delete.
-- =====================================================================
alter table public.tickle_entries
  add column if not exists goal_id uuid references public.goals(id) on delete set null;

comment on column public.tickle_entries.goal_id is
  'Nullable, one goal per entry. ON DELETE SET NULL — deleting a goal clears the tag rather than orphaning the entry or blocking the delete.';


-- =====================================================================
-- Row Level Security for goals
-- =====================================================================
alter table public.goals enable row level security;

drop policy if exists "users manage their own goals" on public.goals;
create policy "users manage their own goals"
  on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
