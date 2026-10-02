-- =====================================================================
-- DayTickles — migration: Multickle wording in trigger error messages
-- =====================================================================
-- Tales were renamed to Multickles in the UI (9647e8c). These trigger
-- messages reach the reader through showAlert(..., error.message), so
-- they're renamed too. Text-only: both function bodies are otherwise
-- identical to 0067, and CREATE OR REPLACE keeps the existing triggers
-- (enforce_tale_chapter_rules, prevent_self_tale_follow_insert) bound.
-- Code-level names (tales, tale_id, tale_follows) are unchanged.

create or replace function public.enforce_tale_chapter_rules()
returns trigger
language plpgsql
as $$
declare
  v_owner      uuid;
  v_completed  timestamptz;
begin
  if new.tale_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.tale_id is not distinct from old.tale_id then
    return new;
  end if;

  select user_id, completed_at into v_owner, v_completed
  from public.tales where id = new.tale_id;

  if v_owner is null or v_owner <> new.user_id then
    raise exception 'You can only add your own Tickles to your own Multickle';
  end if;
  if new.visibility <> 'public' then
    raise exception 'Only Rippled Tickles can be added to a Multickle';
  end if;
  if v_completed is not null then
    raise exception 'This Multickle is complete and can''t take new chapters';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_self_tale_follow()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.tales where id = new.tale_id and user_id = new.follower_id) then
    raise exception 'Cannot follow your own Multickle';
  end if;
  return new;
end;
$$;
