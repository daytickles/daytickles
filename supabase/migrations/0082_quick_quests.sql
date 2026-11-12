-- =====================================================================
-- DayTickles — migration: Quick Quests
-- Adds: the quick_quests table (one row per Quick Quest the user saves),
-- token_events.quick_quest_id, and the server-side earn trigger
-- award_token_on_quick_quest.
--
-- Each saved Quick Quest earns exactly 1 token, written by the trigger
-- below in the same transaction as the quest row -- so a quest and its
-- token are saved together or not at all. The client never writes
-- token_events itself (still no insert policy there, see 0065).
--
-- A token is never taken back: there is no delete policy on
-- quick_quests, and kept_entry_id / quick_quest_id are "on delete set
-- null", so nothing ever removes a token_events row. There is no limit
-- on how many Quick Quests (and so tokens) a user can save -- by design.
-- Like Goal tagging (award_token_for_goal_tag, 0065), the award does not
-- read profiles.tokens_enabled.
--
-- No prompt text and no note text is stored here: prompt_key is the id
-- of a prompt bundled in the app (e.g. 'N1'), null for notice_three.
--
-- Delete Account removes everything through the profiles cascade
-- (auth.users -> profiles -> quick_quests, token_events); the
-- delete-account Edge Function needs no change.
--
-- Safe to run again (if not exists / drop ... if exists / create or
-- replace). Applied by hand in the Supabase SQL editor.
-- =====================================================================


-- =====================================================================
-- quick_quests
-- kept_entry_id is set later, when the user keeps the quest as a
-- Tickle; deleting that Tickle just clears the link.
-- =====================================================================
create table if not exists public.quick_quests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  kind           text not null
                   check (kind in ('notice', 'explore', 'connect', 'create', 'play', 'notice_three')),
  minutes        smallint check (minutes is null or minutes in (1, 2, 3, 5)),
  prompt_key     text,   -- bundled prompt id, e.g. 'N1'; null for notice_three
  kept_entry_id  uuid references public.tickle_entries(id) on delete set null
);

create index if not exists idx_quick_quests_user_created on public.quick_quests (user_id, created_at desc);


-- =====================================================================
-- RLS: own rows only. Deliberately NO delete policy -- there is no
-- delete button, and Delete Account removes rows by cascade. Deletes
-- are refused twice over: by RLS (no delete policy) and by privilege
-- (delete revoked from authenticated below). anon gets nothing.
-- =====================================================================
alter table public.quick_quests enable row level security;

revoke all on public.quick_quests from anon;
grant select, insert, update on public.quick_quests to authenticated;
revoke delete on public.quick_quests from authenticated;
-- Supabase gives new tables more default privileges than we need; keep only select, insert, update.
revoke truncate, references, trigger on public.quick_quests from authenticated;

drop policy if exists "users view their own quick quests" on public.quick_quests;
create policy "users view their own quick quests"
  on public.quick_quests for select using (auth.uid() = user_id);

-- kept_entry_id may only point at one of the user's own Tickles. The
-- foreign key alone doesn't check that (FK checks ignore RLS), so
-- without this a quest could be linked to someone else's entry id.
drop policy if exists "users insert their own quick quests" on public.quick_quests;
create policy "users insert their own quick quests"
  on public.quick_quests for insert
  with check (
    auth.uid() = user_id
    and (
      kept_entry_id is null
      or exists (
        select 1 from public.tickle_entries e
         where e.id = kept_entry_id and e.user_id = auth.uid()
      )
    )
  );

drop policy if exists "users update their own quick quests" on public.quick_quests;
create policy "users update their own quick quests"
  on public.quick_quests for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      kept_entry_id is null
      or exists (
        select 1 from public.tickle_entries e
         where e.id = kept_entry_id and e.user_id = auth.uid()
      )
    )
  );


-- =====================================================================
-- token_events.quick_quest_id
-- Which Quick Quest earned a row. token_events' RLS is unchanged
-- (select-only for the owner; no insert policy).
-- =====================================================================
alter table public.token_events
  add column if not exists quick_quest_id uuid references public.quick_quests(id) on delete set null;


-- =====================================================================
-- award_token_on_quick_quest
-- Fires once per inserted quick_quests row and adds +1 with reason
-- 'quick_quest'. new.user_id is always the caller's own id: the insert
-- policy above checks auth.uid() = user_id before the row exists.
-- SECURITY DEFINER because token_events has no insert policy for
-- `authenticated` (same reasoning as award_token_for_goal_tag in 0065).
-- Does not read profiles.tokens_enabled -- same as Goal tagging.
--
-- Scoped to INSERT only: editing a quest later (kept_entry_id, etc.)
-- never earns again.
--
-- Only for the trigger: execute is revoked from public, anon and
-- authenticated so it can't be called on its own.
-- =====================================================================
create or replace function public.award_token_on_quick_quest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.token_events (user_id, delta, reason, quick_quest_id)
  values (new.user_id, 1, 'quick_quest', new.id);

  return new;
end;
$$;

revoke execute on function public.award_token_on_quick_quest() from public, anon, authenticated;

drop trigger if exists award_token_on_quick_quest on public.quick_quests;
create trigger award_token_on_quick_quest
  after insert on public.quick_quests
  for each row
  execute function public.award_token_on_quick_quest();


-- =====================================================================
-- Check after applying (not run -- paste into the SQL editor yourself).
-- Expect 5 rows: the 3 policy names, the new column, the trigger.
--
-- select 'policy' as what, policyname::text as name
--   from pg_policies
--  where schemaname = 'public' and tablename = 'quick_quests'
-- union all
-- select 'column', column_name::text
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'token_events'
--    and column_name = 'quick_quest_id'
-- union all
-- select 'trigger', tgname::text
--   from pg_trigger
--  where tgrelid = 'public.quick_quests'::regclass and not tgisinternal
-- order by 1, 2;
-- =====================================================================
