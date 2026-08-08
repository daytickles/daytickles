-- =====================================================================
-- DayTickles — migration: favorite notifications + Awards
--
-- Two additions:
--
-- 1. Favoriting now notifies the entry owner. It didn't before by
--    explicit original design ("no notification, no visible count to
--    anyone else" — see the `favorites` table comment in
--    0001_initial_schema.sql); that's revisited here per product
--    decision. Mirrors handle_like_insert's shape exactly: same-
--    transaction trigger, skips self-favorites (favoriting your own
--    entry is allowed, unlike liking it, so this needs its own guard
--    rather than inheriting the likes trigger's assumption).
--
-- 2. Awards: a richer, one-time recognition layered on top of an
--    existing favorite — Wordweaver/Soulweaver/Wittweaver. Deliberately
--    a separate table from favorites, not a column on it: an award must
--    survive its favorite being removed (per product decision), which a
--    column on the favorites row couldn't do once that row is deleted.
--    RLS is private to the giver, matching favorites (a personal
--    recognition, not a public rating) — NOT the `likes` table's
--    publicly-readable shape.
--
--    Permanence ("once picked, no changing it later") is enforced here
--    at the RLS layer, not just by omitting an edit UI client-side: only
--    SELECT and INSERT policies exist below, no UPDATE or DELETE policy
--    at all. Deliberately NOT a single `for all` policy like favorites'
--    — that would implicitly permit the owner to update/delete their
--    own row too, which is exactly what shouldn't be possible here.
--
--    Self-awarding is blocked outright (mirrors prevent_self_like) — an
--    award is recognition from someone else, and self-awarding would
--    both be hollow and self-send a notification.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Favorite notifications
-- ---------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like','comment','streak_milestone','favorite','award'));

create or replace function public.handle_favorite_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  entry_owner uuid;
begin
  select user_id into entry_owner from public.tickle_entries where id = new.entry_id;

  if entry_owner is not null and entry_owner <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, entry_id, type)
    values (entry_owner, new.user_id, new.entry_id, 'favorite');
  end if;

  return new;
end;
$$;

create trigger on_favorite_insert
  after insert on public.favorites
  for each row execute function public.handle_favorite_insert();


-- ---------------------------------------------------------------------
-- 2. Awards
-- ---------------------------------------------------------------------

create table public.awards (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.tickle_entries(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,   -- who gave it
  award_type   text not null check (award_type in ('wordweaver','soulweaver','wittweaver')),
  created_at   timestamptz not null default now(),

  unique (entry_id, user_id)   -- one award per person per entry
);

create index idx_awards_entry on public.awards (entry_id);

comment on table public.awards is
  'Permanent, one-time recognition on top of an existing favorite. Independent of favorites once given -- removing the favorite does not remove the award. No UPDATE/DELETE RLS policy anywhere below: that is what makes a given award unchangeable, not just missing client UI.';

alter table public.awards enable row level security;

create policy "users see their own awards"
  on public.awards for select using (auth.uid() = user_id);
create policy "users give their own awards"
  on public.awards for insert with check (auth.uid() = user_id);

create or replace function public.prevent_self_award()
returns trigger
language plpgsql
security definer
as $$
declare
  entry_owner uuid;
begin
  select user_id into entry_owner from public.tickle_entries where id = new.entry_id;

  if entry_owner = new.user_id then
    raise exception 'Cannot award your own entry';
  end if;

  return new;
end;
$$;

create trigger prevent_self_award_insert
  before insert on public.awards
  for each row execute function public.prevent_self_award();

-- award_type is nullable -- only set on rows where type = 'award'. No
-- CHECK tying the two together (e.g. "award_type is null unless
-- type='award'") to keep this migration simple; the app is the only
-- writer of notifications rows and never sets award_type otherwise.
alter table public.notifications add column award_type text
  check (award_type in ('wordweaver','soulweaver','wittweaver'));

-- prevent_self_award_insert (BEFORE) already guarantees entry_owner <>
-- new.user_id by the time this AFTER trigger runs, so unlike
-- handle_favorite_insert above, no self-award guard is needed here.
create or replace function public.handle_award_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  entry_owner uuid;
begin
  select user_id into entry_owner from public.tickle_entries where id = new.entry_id;

  insert into public.notifications (recipient_id, actor_id, entry_id, type, award_type)
  values (entry_owner, new.user_id, new.entry_id, 'award', new.award_type);

  return new;
end;
$$;

create trigger on_award_insert
  after insert on public.awards
  for each row execute function public.handle_award_insert();
