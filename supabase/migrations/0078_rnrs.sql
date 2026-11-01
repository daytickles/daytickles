-- =====================================================================
-- DayTickles — Routines and Reminders (RnRs)
--
-- Small things the user plans for Morning, Afternoon or Evening of a
-- given day, as tiles. One kind of tile: the user decides whether it is
-- a routine or a reminder. No notifications, no times, no repeats, no
-- tokens. Only the owner ever sees these rows.
--
-- rnr_tiles holds the user's own tiles. Starter tiles are NOT rows:
-- they are constants in lib/rnrs.js (STARTER_TILES), and a placement
-- stores the starter's key instead of a tile id, so the wording can
-- change in the app without a migration.
--
-- rnr_placements is a tile placed on a day (plan_date, a local
-- calendar date, the same convention as tickle_entries.entry_date) in
-- one slot, with a status: planned, done or skipped. Done / Skip / Move
-- update the row, so unlike day_dots this table needs an update policy.
-- Only done rows are ever counted (Weekly Summary); skipped and planned
-- rows on past days are never shown as anything.
--
-- Deleting a tile from the app sets archived_at instead of deleting the
-- row, so past placements keep their label. Delete Account removes
-- everything through the profiles cascade (auth.users -> profiles ->
-- these tables); the delete-account Edge Function needs no change.
--
-- Applied by hand in the SQL editor.
-- =====================================================================

create table public.rnr_tiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 80),
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create index rnr_tiles_user_idx on public.rnr_tiles (user_id);

create table public.rnr_placements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  plan_date    date not null,
  slot         text not null check (slot in ('morning', 'afternoon', 'evening')),
  tile_id      uuid references public.rnr_tiles(id) on delete cascade,
  starter_key  text check (char_length(starter_key) between 1 and 40),
  status       text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  position     smallint,
  done_at      timestamptz,
  created_at   timestamptz not null default now(),

  check (num_nonnulls(tile_id, starter_key) = 1)
);

create index rnr_placements_user_date_idx on public.rnr_placements (user_id, plan_date);

comment on column public.rnr_placements.plan_date is
  'The local calendar date this tile is planned for (same convention as tickle_entries.entry_date).';
comment on column public.rnr_placements.starter_key is
  'Key of a starter tile from lib/rnrs.js STARTER_TILES. Set instead of tile_id; never renamed or reused once shipped.';
comment on column public.rnr_placements.status is
  '''done'' rows are the only ones ever counted (Weekly Summary). ''skipped'' and ''planned'' carry no visible trace on past days.';

-- ---------------------------------------------------------------------
-- RLS: own rows only, signed-in users only. anon gets nothing.
-- ---------------------------------------------------------------------

alter table public.rnr_tiles enable row level security;
alter table public.rnr_placements enable row level security;

revoke all on public.rnr_tiles from anon;
revoke all on public.rnr_placements from anon;

create policy "users can view their own rnr tiles"
  on public.rnr_tiles for select to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own rnr tiles"
  on public.rnr_tiles for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own rnr tiles"
  on public.rnr_tiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete their own rnr tiles"
  on public.rnr_tiles for delete to authenticated
  using (auth.uid() = user_id);

-- A placement may only point at one of the user's own tiles.
create policy "users can view their own rnr placements"
  on public.rnr_placements for select to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own rnr placements"
  on public.rnr_placements for insert to authenticated
  with check (
    auth.uid() = user_id
    and (tile_id is null or exists (
      select 1 from public.rnr_tiles t where t.id = tile_id and t.user_id = auth.uid()
    ))
  );

create policy "users can update their own rnr placements"
  on public.rnr_placements for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (tile_id is null or exists (
      select 1 from public.rnr_tiles t where t.id = tile_id and t.user_id = auth.uid()
    ))
  );

create policy "users can delete their own rnr placements"
  on public.rnr_placements for delete to authenticated
  using (auth.uid() = user_id);
