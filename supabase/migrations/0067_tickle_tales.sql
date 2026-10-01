-- =====================================================================
-- DayTickles — migration: TickleTales
--
-- A TickleTale is a named, public, ongoing thread of Ripples. A chapter
-- is just a normal Rippled Tickle with tickle_entries.tale_id set -- no
-- new content type. Same two-step shape as Goals (create the Tale, then
-- tag entries to it afterward), but deliberately NOT a copy of goals'
-- privacy model: goals are private to their owner, a Tale is publicly
-- readable so anyone can open its chapters and follow it.
--
-- Four pieces:
--   1. tales                   -- the Tale itself (title, blurb, completed_at)
--   2. tickle_entries.tale_id  -- the chapter tag, plus a guard trigger
--   3. tale_follows            -- "Follow this Tale", parallel to follows
--   4. 'tale_chapter'          -- in-app notification fan-out to followers
--
-- Deliberately its own column, not a reuse of goal_id: goal_id drives
-- award_token_on_goal_tag (0065), and Tale tagging must never earn
-- tokens.
--
-- No soft cap anywhere in here. A chapter only ever becomes visible by
-- being Rippled, and every private -> public flip already draws from
-- the right Ripple bucket client-side (lib/freemiumCaps.js); tagging an
-- already-public entry costs nothing extra. Tale creation and Tale
-- follows are uncapped by product decision (2026-10-02).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. tales
-- ---------------------------------------------------------------------
create table public.tales (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 60),
  blurb         text check (blurb is null or char_length(blurb) <= 200),
  completed_at  timestamptz,          -- null = Ongoing; mirrors goals.achieved_at (0013)
  created_at    timestamptz not null default now()
);

create index idx_tales_user on public.tales (user_id);

comment on table public.tales is
  'TickleTales: a named public thread of Rippled Tickles. Publicly readable (unlike goals). Chapters are tickle_entries rows with tale_id set; chapter numbers are computed, never stored.';
comment on column public.tales.completed_at is
  'Null = Ongoing. Once set the Tale is closed to new chapters (enforced by enforce_tale_chapter_rules); existing chapters are untouched.';

alter table public.tales enable row level security;

create policy "tales are publicly readable"
  on public.tales for select using (true);
create policy "users create their own tales"
  on public.tales for insert with check (auth.uid() = user_id);
create policy "users update their own tales"
  on public.tales for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete their own tales"
  on public.tales for delete using (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 2. tickle_entries.tale_id + guard
-- ---------------------------------------------------------------------
-- ON DELETE SET NULL, same as goal_id -- deleting a Tale untags its
-- chapters, never deletes or hides them.
alter table public.tickle_entries
  add column tale_id uuid references public.tales(id) on delete set null;

comment on column public.tickle_entries.tale_id is
  'Nullable, one Tale per entry. Only settable on your own public entry, into your own Ongoing Tale (enforce_tale_chapter_rules). Stays set across Un-Ripple -- RLS hides the chapter while private, it reappears on re-Ripple.';

-- Tale view: chapters by entry_date (then created_at as tiebreak).
create index idx_entries_tale on public.tickle_entries (tale_id, entry_date, created_at)
  where tale_id is not null;

-- tales is publicly readable, so nothing else stops a client writing an
-- arbitrary tale_id -- this is the real enforcement, not the UI.
-- Only checked when tale_id is actually being SET to a new value:
--   * clearing it (-> null) is always allowed, Ongoing or Complete,
--   * an Un-Ripple (visibility change with tale_id untouched) is never
--     blocked -- tale_id deliberately stays set while private,
--   * a re-Ripple of an existing chapter into a since-Completed Tale is
--     also allowed (it was already a chapter; nothing new is added).
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
    raise exception 'You can only add your own Tickles to your own Tale';
  end if;
  if new.visibility <> 'public' then
    raise exception 'Only Rippled Tickles can be added to a Tale';
  end if;
  if v_completed is not null then
    raise exception 'This Tale is complete and can''t take new chapters';
  end if;

  return new;
end;
$$;

create trigger enforce_tale_chapter_rules
  before insert or update of tale_id on public.tickle_entries
  for each row execute function public.enforce_tale_chapter_rules();


-- ---------------------------------------------------------------------
-- 3. tale_follows
-- ---------------------------------------------------------------------
-- Same shape and RLS as follows (0001). Separate relationship: does not
-- count toward the `following` cap, and doesn't affect the Following tab.
create table public.tale_follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  tale_id      uuid not null references public.tales(id) on delete cascade,
  created_at   timestamptz not null default now(),

  unique (follower_id, tale_id)
);

create index idx_tale_follows_tale on public.tale_follows (tale_id);

alter table public.tale_follows enable row level security;

create policy "tale follows are publicly readable"
  on public.tale_follows for select using (true);
create policy "users can follow tales as themselves"
  on public.tale_follows for insert with check (auth.uid() = follower_id);
create policy "users can unfollow tales as themselves"
  on public.tale_follows for delete using (auth.uid() = follower_id);

-- follows' check (follower_id <> followee_id) can't be a plain CHECK
-- here -- the owner lives on tales, not on this row.
create or replace function public.prevent_self_tale_follow()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.tales where id = new.tale_id and user_id = new.follower_id) then
    raise exception 'Cannot follow your own Tale';
  end if;
  return new;
end;
$$;

create trigger prevent_self_tale_follow_insert
  before insert on public.tale_follows
  for each row execute function public.prevent_self_tale_follow();


-- ---------------------------------------------------------------------
-- 4. tale_chapter notifications (in-app only, no push)
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like','comment','streak_milestone','favorite','award','tale_chapter'));

-- Routes the notification to the Tale view. Cascade: a deleted Tale's
-- notifications would only ever route to a dead screen.
alter table public.notifications
  add column tale_id uuid references public.tales(id) on delete cascade;

-- Fan-out, one row per follower, skipping the author (who can't follow
-- their own Tale anyway -- the <> is belt-and-braces). Fires whenever a
-- chapter BECOMES visible: tagged while public, or re-Rippled while
-- tagged. Two deliberate limits:
--   * de-duplicated per (recipient, entry) -- an Un-Ripple/re-Ripple
--     toggle never re-notifies the same follower for the same chapter,
--   * skipped for a Completed Tale -- the only way a chapter becomes
--     visible there is re-Rippling an existing one, which isn't news.
-- Runs AFTER enforce_tale_chapter_rules (BEFORE), so an invalid tag
-- never gets this far.
create or replace function public.handle_tale_chapter_visible()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.tale_id is null or new.visibility <> 'public' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.tale_id is not distinct from old.tale_id
     and old.visibility = 'public' then
    return new;  -- already visible before this update, nothing new
  end if;
  if exists (select 1 from public.tales where id = new.tale_id and completed_at is not null) then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, entry_id, tale_id, type)
  select tf.follower_id, new.user_id, new.id, new.tale_id, 'tale_chapter'
  from public.tale_follows tf
  where tf.tale_id = new.tale_id
    and tf.follower_id <> new.user_id
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = tf.follower_id
        and n.entry_id = new.id
        and n.type = 'tale_chapter'
    );

  return new;
end;
$$;

create trigger on_tale_chapter_visible
  after insert or update of tale_id, visibility on public.tickle_entries
  for each row execute function public.handle_tale_chapter_visible();
