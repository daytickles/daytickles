-- =====================================================================
-- DayTickles — Private trackers
--
-- Up to 5 things a user chooses to keep track of, each rated once a day.
-- The user names each tracker themselves; nothing here suggests names.
-- Only the owner ever sees these rows: no sharing, no Ripple, no
-- notifications, no view or function that reads them for anyone else.
--
-- trackers: the user's own trackers. method is how a day is rated:
--   'words'  -- one of five words, stored as 0..4
--               (0 None, 1 A little, 2 Some, 3 A lot, 4 Intense);
--               the words live in the app, not here
--   'scale'  -- a whole number 0..10
--   'amount' -- a number 0..100000, with an optional unit (e.g. the
--               user's own word for what they count); unit is only
--               allowed for 'amount'
-- sort_order is the user's own order on screen. method is fixed after
-- creation (lock_tracker_method); name and unit may still be edited.
--
-- tracker_ratings: one rating per tracker per day (unique tracker_id +
-- day), changed by upsert. day is the user's own local calendar date,
-- sent by the app (the same convention as day_dots.prompt_date and
-- tickle_entries.entry_date). The value is checked against the
-- tracker's method by a trigger, and the rating's user_id must be the
-- tracker's user_id.
--
-- The 5-tracker limit is enforced here (enforce_tracker_cap), not only
-- in the app.
--
-- Delete Account removes everything through the profiles cascade
-- (auth.users -> profiles -> these tables); the delete-account Edge
-- Function needs no change. Deleting a tracker deletes its ratings.
-- profiles is not touched: the Home card's on/off is in
-- profiles.home_cards (0080).
--
-- Safe to run again (if not exists / drop ... if exists / create or
-- replace). Applied by hand in the SQL editor.
-- =====================================================================

create table if not exists public.trackers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  method       text not null check (method in ('words', 'scale', 'amount')),
  unit         text check (unit is null or char_length(btrim(unit)) between 1 and 20),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),

  check (method = 'amount' or unit is null)
);

create index if not exists trackers_user_idx on public.trackers (user_id, sort_order);

create table if not exists public.tracker_ratings (
  id           uuid primary key default gen_random_uuid(),
  tracker_id   uuid not null references public.trackers(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  day          date not null,
  value        numeric not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (tracker_id, day)
);

create index if not exists tracker_ratings_tracker_day_idx on public.tracker_ratings (tracker_id, day desc);

comment on column public.trackers.method is
  '''words'' = 0..4 (None, A little, Some, A lot, Intense; the words are in the app), ''scale'' = whole number 0..10, ''amount'' = 0..100000 with an optional unit.';
comment on column public.trackers.unit is
  'Only for method ''amount'': the user''s own word for what is counted. Null for every other method.';
comment on column public.tracker_ratings.day is
  'The user''s own local calendar date, sent by the app (same convention as day_dots.prompt_date).';
comment on column public.tracker_ratings.value is
  'Checked against the tracker''s method by check_tracker_rating(): words 0..4 whole, scale 0..10 whole, amount 0..100000.';

-- ---------------------------------------------------------------------
-- At most 5 trackers per user. The advisory lock makes two inserts at
-- the same moment for the same user wait for each other, so both can't
-- pass the count.
-- ---------------------------------------------------------------------

create or replace function public.enforce_tracker_cap()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('trackers:' || new.user_id::text, 0));
  if (select count(*) from public.trackers where user_id = new.user_id) >= 5 then
    raise exception 'Tracker limit reached (5 max)';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_tracker_cap on public.trackers;
create trigger enforce_tracker_cap
  before insert on public.trackers
  for each row execute function public.enforce_tracker_cap();

-- ---------------------------------------------------------------------
-- A rating's value must suit its tracker's method, and the rating must
-- belong to the tracker's owner. Runs as the caller, so it only ever
-- sees trackers the caller can see (their own).
-- ---------------------------------------------------------------------

create or replace function public.check_tracker_rating()
returns trigger
language plpgsql
as $$
declare
  t_method text;
  t_user   uuid;
begin
  select method, user_id into t_method, t_user
    from public.trackers where id = new.tracker_id;

  if t_method is null then
    raise exception 'Tracker not found';
  end if;
  if new.user_id is distinct from t_user then
    raise exception 'A rating must belong to the tracker''s owner';
  end if;

  if t_method = 'words' then
    if new.value <> trunc(new.value) or new.value < 0 or new.value > 4 then
      raise exception 'This tracker takes a whole number from 0 to 4';
    end if;
  elsif t_method = 'scale' then
    if new.value <> trunc(new.value) or new.value < 0 or new.value > 10 then
      raise exception 'This tracker takes a whole number from 0 to 10';
    end if;
  elsif t_method = 'amount' then
    if new.value < 0 or new.value > 100000 then
      raise exception 'This tracker takes a number from 0 to 100000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists check_tracker_rating on public.tracker_ratings;
create trigger check_tracker_rating
  before insert or update on public.tracker_ratings
  for each row execute function public.check_tracker_rating();

create or replace function public.lock_tracker_method()
returns trigger
language plpgsql
as $$
begin
  if new.method is distinct from old.method then
    raise exception 'A tracker''s rating method cannot be changed. Delete it and add a new one.';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_tracker_method on public.trackers;
create trigger lock_tracker_method
  before update of method on public.trackers
  for each row execute function public.lock_tracker_method();

-- updated_at on every change (the shared helper from 0001).
drop trigger if exists tracker_ratings_set_updated_at on public.tracker_ratings;
create trigger tracker_ratings_set_updated_at
  before update on public.tracker_ratings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS: own rows only, signed-in users only. anon gets nothing.
-- ---------------------------------------------------------------------

alter table public.trackers enable row level security;
alter table public.tracker_ratings enable row level security;

revoke all on public.trackers from anon;
revoke all on public.tracker_ratings from anon;

drop policy if exists "users can view their own trackers" on public.trackers;
create policy "users can view their own trackers"
  on public.trackers for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users can insert their own trackers" on public.trackers;
create policy "users can insert their own trackers"
  on public.trackers for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can update their own trackers" on public.trackers;
create policy "users can update their own trackers"
  on public.trackers for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete their own trackers" on public.trackers;
create policy "users can delete their own trackers"
  on public.trackers for delete to authenticated
  using (auth.uid() = user_id);

-- A rating may only point at one of the user's own trackers.
drop policy if exists "users can view their own tracker ratings" on public.tracker_ratings;
create policy "users can view their own tracker ratings"
  on public.tracker_ratings for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users can insert their own tracker ratings" on public.tracker_ratings;
create policy "users can insert their own tracker ratings"
  on public.tracker_ratings for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trackers t where t.id = tracker_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "users can update their own tracker ratings" on public.tracker_ratings;
create policy "users can update their own tracker ratings"
  on public.tracker_ratings for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trackers t where t.id = tracker_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "users can delete their own tracker ratings" on public.tracker_ratings;
create policy "users can delete their own tracker ratings"
  on public.tracker_ratings for delete to authenticated
  using (auth.uid() = user_id);
