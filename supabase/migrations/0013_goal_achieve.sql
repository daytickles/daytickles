-- =====================================================================
-- Adds an "Achieve" action for goals, distinct from Delete: achieving a
-- goal keeps the row (and its color, still shown faded+ticked on
-- entries already tagged with it) but frees its slot against the
-- 5-goal cap, rather than deleting the row and untagging every entry
-- via the goal_id FK's ON DELETE SET NULL.
-- =====================================================================

alter table public.goals
  add column if not exists achieved_at timestamptz;

comment on column public.goals.achieved_at is
  'Null = active, counts against the 5-goal cap. Non-null = achieved: row and color are kept for entries already tagged with it, but the slot is freed for a new goal.';

-- Re-point the cap check at active goals only, so achieving one frees
-- its slot for a new goal instead of it still counting toward the limit.
create or replace function public.enforce_goal_cap()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.goals where user_id = new.user_id and achieved_at is null) >= 5 then
    raise exception 'Goal limit reached (5 max)';
  end if;
  return new;
end;
$$;
