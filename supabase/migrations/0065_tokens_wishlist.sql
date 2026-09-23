-- =====================================================================
-- DayTickles — migration: Tokens & Rewards
-- Adds: goals.earns_tokens, the token_events ledger, wishlist_items,
-- the server-side earn trigger, the redeem RPC, and profiles.tokens_enabled.
-- =====================================================================

-- =====================================================================
-- goals.earns_tokens
-- Independent per-Goal on/off toggle -- multiple Goals can be
-- token-earning at once. No relation to Vibe target lightbulbs.
-- =====================================================================
alter table public.goals
  add column if not exists earns_tokens boolean not null default false;


-- =====================================================================
-- wishlist_items
-- Repeatable by default -- redeeming just deducts and the item stays
-- on the list; a one-off item is removed manually by the user.
--
-- Declared before token_events below, not just topically first --
-- token_events.wishlist_item_id references this table, so it has to
-- exist first or the FK declaration fails at migration time.
-- =====================================================================
create table if not exists public.wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 60),
  cost        integer not null check (cost > 0),
  icon        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_wishlist_items_user on public.wishlist_items (user_id);

alter table public.wishlist_items enable row level security;

drop policy if exists "users manage their own wishlist items" on public.wishlist_items;
create policy "users manage their own wishlist items"
  on public.wishlist_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- =====================================================================
-- token_events
-- Append-only ledger -- balance = sum of a user's own rows, never a
-- single mutable counter. Deliberately has NO insert policy for
-- `authenticated` below: every row is written by a security-definer
-- trigger/function (award_token_for_goal_tag / redeem_wishlist_item),
-- never directly by the client. Same reasoning as enforce_goal_cap's
-- own comment in 0002_goals.sql -- an RLS-protected table is reachable
-- directly by any authenticated client, so letting clients insert their
-- own positive-delta rows would let anyone grant themselves unlimited
-- tokens regardless of app-side logic.
-- =====================================================================
create table if not exists public.token_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  delta             integer not null check (delta <> 0),
  reason            text not null,   -- 'goal_tag' | 'wishlist_redeem'
  goal_id           uuid references public.goals(id) on delete set null,
  wishlist_item_id  uuid references public.wishlist_items(id) on delete set null,
  entry_id          uuid references public.tickle_entries(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_token_events_user on public.token_events (user_id);

alter table public.token_events enable row level security;

drop policy if exists "users view their own token events" on public.token_events;
create policy "users view their own token events"
  on public.token_events for select using (auth.uid() = user_id);


-- =====================================================================
-- award_token_for_goal_tag
-- Fires on every real change of tickle_entries.goal_id to a non-null
-- value (the WHEN clause below), regardless of which screen performed
-- the update or whether it went through the app UI at all. This is the
-- actual farm-prevention mechanism: an UPDATE that re-sends the same
-- goal_id (a re-tap on an already-tagged row) still fires the trigger,
-- but `new.goal_id is distinct from old.goal_id` is false, so nothing
-- is inserted. A client-side no-op guard (lib/goalTagging.js) exists
-- too, but only to skip a wasted round-trip -- this is the source of
-- truth. Untagging (goal_id -> null) never inserts anything, matching
-- the deliberate no-clawback rule. Switching directly from one
-- token-earning Goal to another earns for the new one without
-- clawing back the old one's earlier earn -- ordinary ledger behavior,
-- not a special case.
--
-- Second farm-prevention layer: the `not exists` check below closes a
-- more practical exploit than the same-goal re-tap the WHEN clause
-- already blocks -- oscillating an entry between two token-earning
-- Goals (A -> B -> A -> B ...) would otherwise earn on every switch,
-- since each transition really is a distinct value even when cycling
-- back to a goal already earned from. Scoped to "this exact (entry,
-- goal) pairing has never earned before", not just "goal_id changed" --
-- an entry can still earn once for Goal A and once for Goal B (multiple
-- Goals can be token-earning simultaneously, per spec), just never a
-- second time for a goal it's already earned from. A plain `not
-- exists` rather than a unique index + ON CONFLICT, deliberately --
-- same "skip the DB-locking machinery, keep it simple" call as
-- redeem_wishlist_item's own accepted balance-race gap below; a hard
-- concurrency guarantee isn't needed here either.
--
-- Scoped to UPDATE OF goal_id only, not INSERT -- matches every
-- current call site (home.js/calendar.js/feed.js's assignGoal, via
-- lib/goalTagging.js), all of which tag an already-existing entry.
-- If a future feature ever tags a Goal at entry-creation time instead,
-- it won't earn under this trigger alone.
-- =====================================================================
create or replace function public.award_token_for_goal_tag()
returns trigger
language plpgsql
security definer
as $$
declare
  v_earns boolean;
begin
  select earns_tokens into v_earns
    from public.goals
   where id = new.goal_id and user_id = new.user_id;

  if coalesce(v_earns, false) and not exists (
    select 1 from public.token_events
     where entry_id = new.id and goal_id = new.goal_id and reason = 'goal_tag'
  ) then
    insert into public.token_events (user_id, delta, reason, goal_id, entry_id)
    values (new.user_id, 1, 'goal_tag', new.goal_id, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists award_token_on_goal_tag on public.tickle_entries;
create trigger award_token_on_goal_tag
  after update of goal_id on public.tickle_entries
  for each row
  when (new.goal_id is distinct from old.goal_id and new.goal_id is not null)
  execute function public.award_token_for_goal_tag();


-- =====================================================================
-- redeem_wishlist_item
-- The only path that ever inserts a negative token_events row. Balance
-- is recomputed server-side, not trusted from the client, and the item
-- must belong to the caller (auth.uid(), never a passed-in user id --
-- same "no target-user parameter to get wrong" style as
-- redeem_founding_member_referral_code in 0026). Item stays on the
-- list afterward (repeatable-by-default, per spec) -- this function
-- never deletes from wishlist_items.
--
-- Known accepted gap (client-side mitigation chosen over a DB lock):
-- two near-simultaneous redeem calls for the same user could both read
-- the same pre-redeem balance and both pass the check, over-spending
-- past zero. Not a real-money system, so the client clamps any
-- negative displayed balance to 0 (lib/tokens.js) rather than adding
-- an advisory-lock pattern here.
-- =====================================================================
create or replace function public.redeem_wishlist_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_item    public.wishlist_items%rowtype;
  v_balance integer;
begin
  select * into v_item
    from public.wishlist_items
   where id = p_item_id and user_id = auth.uid();

  if not found then
    return jsonb_build_object('redeemed', false, 'reason', 'not_found');
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from public.token_events
   where user_id = auth.uid();

  if v_balance < v_item.cost then
    return jsonb_build_object('redeemed', false, 'reason', 'insufficient_balance', 'balance', v_balance);
  end if;

  insert into public.token_events (user_id, delta, reason, wishlist_item_id)
  values (auth.uid(), -v_item.cost, 'wishlist_redeem', p_item_id);

  return jsonb_build_object('redeemed', true, 'balance', v_balance - v_item.cost);
end;
$$;


-- =====================================================================
-- get_token_balance
-- Server-side sum so the client never has to pull the whole event log
-- just to display a number. Deliberately no p_user_id parameter --
-- always the caller's own balance, same "nothing to get wrong" shape
-- as redeem_wishlist_item above.
-- =====================================================================
create or replace function public.get_token_balance()
returns integer
language sql
security definer
stable
as $$
  select coalesce(sum(delta), 0)::integer from public.token_events where user_id = auth.uid();
$$;


-- =====================================================================
-- profiles.tokens_enabled
-- Master on/off toggle, independent of the per-Goal earns_tokens
-- toggles -- off hides the whole feature (CornerNav's token circle)
-- regardless of balance or any Goal's own toggle state. Defaults true,
-- matching founding_member_taking_part's existing "visible unless
-- explicitly turned off" convention.
-- =====================================================================
alter table public.profiles
  add column if not exists tokens_enabled boolean not null default true;
