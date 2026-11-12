-- 0084_quick_notes.sql
--
-- Quick Notes (QN): logging a Nudge or Note as a Vibe Tickle.
--
-- Tapping Done on today's nudge offers the three Vibes. Picking one logs a
-- private, text-less Quick Tickle that also carries a copy of the nudge's
-- words (quick_note), so the post can show them. The words are copied, not
-- joined, because renaming a tile changes its label everywhere.
--
-- Tokens are the user's choice, set on each placed nudge (earns_tokens,
-- default false). A QN logged for a placement with earns_tokens on earns
-- +1 token, once for each placed nudge (rnr_placements.id), however many
-- times it is logged or undone. Done on its own earns nothing.
--
-- Like the Quick Quest and Nailed it! awards, the trigger does not read
-- profiles.tokens_enabled: the app hides the switch and the token wording
-- when it is off.
-- Run by hand in the Supabase SQL editor.

alter table public.rnr_placements
  add column earns_tokens boolean not null default false;

alter table public.tickle_entries
  add column quick_note text
    check (char_length(quick_note) between 1 and 80),
  add column rnr_placement_id uuid
    references public.rnr_placements(id) on delete set null;

-- The nudge's words are only ever on a private, text-less Tickle. Writing
-- text with "Tickle it" (the app clears quick_note in the same save) or
-- going public both end the QN, so the words can never ride along on a
-- public row.
alter table public.tickle_entries
  add constraint tickle_entries_quick_note_private
  check (quick_note is null or (visibility = 'private' and text_content is null));

create index tickle_entries_rnr_placement_idx
  on public.tickle_entries (rnr_placement_id)
  where rnr_placement_id is not null;

alter table public.token_events
  add column rnr_placement_id uuid
    references public.rnr_placements(id) on delete set null;

-- Once per placed nudge, however often it is logged, undone and logged again.
create unique index token_events_nudge_once
  on public.token_events (rnr_placement_id)
  where reason = 'nudge_log' and rnr_placement_id is not null;

-- A foreign key ignores RLS, so a Tickle must not be able to point at
-- someone else's placement.
create or replace function public.check_quick_note_placement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rnr_placement_id is not null then
    if not exists (
      select 1 from public.rnr_placements p
       where p.id = new.rnr_placement_id
         and p.user_id = new.user_id
    ) then
      raise exception 'That nudge is not yours';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.check_quick_note_placement() from public, anon, authenticated;

drop trigger if exists check_quick_note_placement on public.tickle_entries;
create trigger check_quick_note_placement
  before insert or update of rnr_placement_id on public.tickle_entries
  for each row execute function public.check_quick_note_placement();

create or replace function public.award_token_on_nudge_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.rnr_placements p
     where p.id = new.rnr_placement_id
       and p.user_id = new.user_id
       and p.earns_tokens
  ) then
    insert into public.token_events (user_id, delta, reason, entry_id, rnr_placement_id)
    values (new.user_id, 1, 'nudge_log', new.id, new.rnr_placement_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.award_token_on_nudge_log() from public, anon, authenticated;

drop trigger if exists award_token_on_nudge_log on public.tickle_entries;
create trigger award_token_on_nudge_log
  after insert on public.tickle_entries
  for each row
  when (new.rnr_placement_id is not null and new.quick_note is not null)
  execute function public.award_token_on_nudge_log();

-- Check after applying (read-only):
--   select table_name, column_name from information_schema.columns
--    where table_schema = 'public'
--      and ((table_name = 'tickle_entries' and column_name in ('quick_note', 'rnr_placement_id'))
--        or (table_name = 'token_events' and column_name = 'rnr_placement_id')
--        or (table_name = 'rnr_placements' and column_name = 'earns_tokens'))
--    order by table_name, column_name;                                  -- 4 rows
--   select tgname from pg_trigger
--    where tgrelid = 'public.tickle_entries'::regclass and not tgisinternal
--    order by tgname;     -- includes award_token_on_nudge_log, check_quick_note_placement
--   select indexname from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('token_events_nudge_once', 'tickle_entries_rnr_placement_idx');  -- 2 rows
