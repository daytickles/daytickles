-- =====================================================================
-- DayTickles — Supabase / Postgres schema
-- Translates daytickles-spec.md into real tables, constraints, triggers,
-- and Row Level Security policies.
--
-- Design notes (read before running):
--
-- 1. Auth: Supabase's built-in `auth.users` handles login/accounts.
--    `profiles` extends it 1:1 (id = auth.users.id) rather than
--    duplicating auth concerns — standard Supabase pattern.
--
-- 2. IDs: uuid everywhere, generated with gen_random_uuid() (pgcrypto,
--    enabled by default on Supabase).
--
-- 3. Constrained text fields (visibility, subscription_plan, report
--    reason/status, notification type) use CHECK constraints rather
--    than Postgres ENUM types. Enums are painful to extend later
--    (adding a value is a schema migration with locking implications);
--    CHECK constraints are a one-line ALTER. Given this app is still
--    actively evolving (as this whole conversation shows), that
--    flexibility is worth more than enum's marginal storage savings.
--
-- 4. Founding Member "distinct days" tracking uses a proper join table
--    (founding_activity_days) rather than a date[] array column.
--    Counting distinct days is then a plain COUNT(*), and it composes
--    cleanly with SQL rather than needing array functions.
--
-- 5. The "first 25 people, globally, in order" problem — flagged in the
--    spec as impossible in the local-only prototype — is solved here
--    with a single atomic Postgres function (award_founding_member,
--    near the bottom) using SELECT ... FOR UPDATE row locking on the
--    app_config counter. Two people qualifying in the same millisecond
--    can't both slip in under the cap; the database serializes them.
--
-- 6. Row Level Security (RLS) is enabled on every table. Supabase
--    exposes tables directly to client apps over its API, so RLS is
--    what actually enforces "can this user see/edit this row" — it is
--    not optional the way it might be with a traditional app-server
--    architecture where the server itself gatekeeps every query.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- profiles
-- Extends auth.users 1:1. Row is created by a trigger on signup
-- (see handle_new_user() near the bottom) rather than by the client,
-- so every authenticated user always has exactly one profile row.
-- =====================================================================
create table public.profiles (
  id                          uuid primary key references auth.users(id) on delete cascade,
  username                    text not null unique,
  display_name                text,
  avatar_url                  text,
  locale                      text not null default 'en',
  country                     text,                          -- nullable, 2-letter code e.g. 'ES'; null = no flag shown
  accent_theme                text not null default 'rust'
                                check (accent_theme in ('rust','sage','dusk','mauve','ochre')),

  -- trial / subscription
  trial_started_at            timestamptz not null default now(),
  subscription_plan           text not null default 'none'
                                check (subscription_plan in ('none','monthly','annual','lifetime')),
  subscription_expires_at     timestamptz,                   -- null for lifetime and for 'none'

  -- sharing soft cap (declining monthly allowance — see spec)
  share_period_start          date not null default current_date,
  share_count_this_period     integer not null default 0,

  -- founding member program
  founding_member_badge       boolean not null default false,
  founding_reward_granted_at  timestamptz,                   -- 3-month reward window starts here

  -- notification preferences
  notify_on_likes             boolean not null default true,
  daily_reminder              boolean not null default true,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on column public.profiles.country is
  'Nullable and purely social (drives the flag next to a name). Never required, editable anytime.';
comment on column public.profiles.subscription_expires_at is
  'Null for lifetime plans and for plan=none. Checked at the point of feed access, not polled.';

create index idx_profiles_username on public.profiles (username);


-- =====================================================================
-- app_config
-- Single global row (id is always 1), not per-user. Read by every
-- client on both DayTickles.app and DayTickles.com.
-- =====================================================================
create table public.app_config (
  id                              smallint primary key default 1 check (id = 1),  -- enforces a single row
  active_seasonal_palette         text not null default 'default',   -- 'default' = permanent 70s retro
  palette_start_date              date,
  palette_end_date                date,
  founding_member_promo_active    boolean not null default true,
  founding_members_awarded_count  integer not null default 0,
  founding_members_cap            integer not null default 25,
  updated_at                      timestamptz not null default now()
);

insert into public.app_config (id) values (1);

comment on table public.app_config is
  'Global settings, one row. Seasonal palette + founding-member promo switches, same admin-controlled pattern for both.';


-- =====================================================================
-- animation_templates
-- Static reference data (the sun/wave/gem shape geometry). Colors are
-- NOT stored here — color comes entirely from the entry's mood +
-- the viewer's... no, wait: color comes from the AUTHOR's accent_theme
-- at render time, same as the prototype. See tickle_entries below.
-- =====================================================================
create table public.animation_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- 'sun' | 'wave' | 'gem'
  style       text not null,                 -- free-form descriptor for future template variety
  lottie_url  text,                          -- null while templates are simple shape animations, not Lottie files yet
  created_at  timestamptz not null default now()
);

insert into public.animation_templates (name, style) values
  ('sun',  'pulse'),
  ('wave', 'triangle-bounce'),
  ('gem',  'rotate');


-- =====================================================================
-- goals
-- Personal categories a person wants to notice more positivity in
-- (e.g. "Travel to work"). Purely personal — never shown to anyone
-- else, unlike everything else with a color in this app.
-- =====================================================================
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 60),
  color       text not null,        -- hex string; client offers a fixed small palette, not a free color picker
  created_at  timestamptz not null default now()
);

create index idx_goals_user on public.goals (user_id);

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

create trigger check_goal_cap
  before insert on public.goals
  for each row execute function public.enforce_goal_cap();


-- =====================================================================
-- tickle_entries
-- One entry per user per day (unique constraint below) — the core
-- journaling loop.
-- =====================================================================
create table public.tickle_entries (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  entry_date             date not null default current_date,
  text_content           text not null check (char_length(text_content) between 1 and 500),
  media_url              text,
  animation_template_id  uuid references public.animation_templates(id),
  mood                   text not null check (mood in ('hint','warm','good','big')),
  visibility             text not null default 'private' check (visibility in ('private','public')),
  like_count             integer not null default 0,          -- cached, maintained by trigger — see below
  goal_id                uuid references public.goals(id) on delete set null,
  created_at             timestamptz not null default now(),

  unique (user_id, entry_date)
);

comment on column public.tickle_entries.visibility is
  'The single switch deciding feed presence — there is no separate publish step.';
comment on column public.tickle_entries.like_count is
  'Cached counter, kept in sync by trigger on likes insert/delete. Avoids a live COUNT() on every feed/journal load.';
comment on column public.tickle_entries.goal_id is
  'Nullable, one goal per entry. ON DELETE SET NULL — deleting a goal clears the tag rather than orphaning the entry or blocking the delete.';

create index idx_entries_user_date on public.tickle_entries (user_id, entry_date desc);
create index idx_entries_public_feed on public.tickle_entries (visibility, created_at desc) where visibility = 'public';

-- "Most-liked entry in the last 14 days" (the Home screen's pinned
-- slot) is deliberately a query, not a stored flag — recalculates
-- automatically as likes arrive and ages out with no manual unpinning.
-- Exposed as a view so the client can just select from it directly:
create view public.pinned_entries as
select distinct on (user_id) *
from public.tickle_entries
where created_at > now() - interval '14 days'
order by user_id, like_count desc, created_at desc;


-- =====================================================================
-- likes
-- =====================================================================
create table public.likes (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.tickle_entries(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),

  unique (entry_id, user_id)   -- one like per person per entry
);

create index idx_likes_entry on public.likes (entry_id);


-- =====================================================================
-- comments
-- Table exists per the spec's data model, but the app doesn't expose
-- a comments UI yet — it's an explicit "Open question for v2"
-- ("enable comments, or keep the feed like-only to keep it low-
-- pressure?"). Included now so the schema doesn't need a breaking
-- migration if/when that question is answered yes; simply unused
-- (and safe to leave unused) until then.
-- =====================================================================
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.tickle_entries(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 500),
  created_at  timestamptz not null default now()
);

create index idx_comments_entry on public.comments (entry_id, created_at);


-- =====================================================================
-- notifications
-- Reference the entry directly, so a like surfaces right on that
-- day's journal card rather than in a generic activity feed.
-- =====================================================================
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,   -- null for system notifications e.g. streak_milestone
  entry_id     uuid references public.tickle_entries(id) on delete cascade,
  type         text not null check (type in ('like','comment','streak_milestone')),
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index idx_notifications_recipient on public.notifications (recipient_id, is_read, created_at desc);


-- =====================================================================
-- follows
-- One-directional (no follow-back requirement), powers the feather
-- badge and the Following feed tab.
-- =====================================================================
create table public.follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  followee_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),

  unique (follower_id, followee_id),
  check (follower_id <> followee_id)     -- can't follow yourself
);

create index idx_follows_follower on public.follows (follower_id);
create index idx_follows_followee on public.follows (followee_id);


-- =====================================================================
-- tickle_shares
-- One-to-one sharing via an unlisted link — deliberately separate
-- from `visibility`, so a private entry can still be shared without
-- becoming public. share_token drives a read-only web preview
-- (daytickles.app/t/<token>), no login, no install wall.
-- =====================================================================
create table public.tickle_shares (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.tickle_entries(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(9), 'base64'),
  caption     text check (caption in ('thought_of_you','made_me_smile')),  -- which of the two share captions was used
  created_at  timestamptz not null default now()
);

create index idx_shares_created_by on public.tickle_shares (created_by, created_at desc);

comment on column public.tickle_shares.share_token is
  'URL-safe unique token for the unlisted preview link daytickles.app/t/<token>.';


-- =====================================================================
-- reports
-- Reporting hides the entry from the reporter immediately (client-
-- side / via hidden_posts below) without waiting on review; this
-- table is the moderation queue.
-- =====================================================================
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.tickle_entries(id) on delete cascade,
  reported_by  uuid not null references public.profiles(id) on delete cascade,
  reason       text not null check (reason in ('spam','harassment','inappropriate','other')),
  status       text not null default 'pending' check (status in ('pending','reviewed','actioned')),
  created_at   timestamptz not null default now(),

  unique (entry_id, reported_by)   -- one report per person per entry
);

create index idx_reports_status on public.reports (status, created_at);

-- Personal, per-user hide list — separate from moderation status.
-- Reporting always inserts here too (see report_entry() function),
-- but a user could also mute something without reporting it, so the
-- two concerns are kept in separate tables rather than overloading
-- `reports` with a purely personal "don't show me this" flag.
create table public.hidden_posts (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  entry_id    uuid not null references public.tickle_entries(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, entry_id)
);


-- =====================================================================
-- favorites
-- Private personal save list — distinct from likes. No notification,
-- no visible count to anyone else. Works on the person's own entries
-- and others' alike; powers the feed's Fav's tab.
-- =====================================================================
create table public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  entry_id    uuid not null references public.tickle_entries(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, entry_id)
);


-- =====================================================================
-- founding_activity_days
-- Backs the Founding Member program's "distinct calendar days" rule.
-- One row per (user, activity_type, day) — the unique constraint IS
-- the anti-gaming rule: inserting the same day twice is a no-op, so
-- bursting 10 shares in one sitting still only ever counts as 1 day.
-- =====================================================================
create table public.founding_activity_days (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  activity_type  text not null check (activity_type in ('post','share')),
  activity_day   date not null default current_date,
  primary key (user_id, activity_type, activity_day)
);

comment on table public.founding_activity_days is
  'Distinct-day tracking for the Founding Member thresholds (1 post day, 5 share days, within 14 days of signup).';


-- =====================================================================
-- Triggers
-- =====================================================================

-- Keep tickle_entries.like_count in sync, and fire the notification,
-- in the same transaction as the like insert/delete — no polling, no
-- external webhooks, matches the spec exactly.
create or replace function public.handle_like_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  entry_owner uuid;
  entry_text  text;
begin
  update public.tickle_entries
     set like_count = like_count + 1
   where id = new.entry_id
   returning user_id, text_content into entry_owner, entry_text;

  if entry_owner is not null and entry_owner <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, entry_id, type)
    values (entry_owner, new.user_id, new.entry_id, 'like');
  end if;

  return new;
end;
$$;

create trigger on_like_insert
  after insert on public.likes
  for each row execute function public.handle_like_insert();


create or replace function public.handle_like_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.tickle_entries
     set like_count = greatest(0, like_count - 1)
   where id = old.entry_id;
  return old;
end;
$$;

create trigger on_like_delete
  after delete on public.likes
  for each row execute function public.handle_like_delete();


-- Auto-create a profiles row whenever someone signs up via Supabase
-- Auth. username defaults to a placeholder derived from the user id;
-- the client should prompt to set a real one immediately after
-- signup (matches the "pick a username" onboarding screen already
-- designed).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'tickler_' || substr(new.id::text, 1, 8));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Keep profiles.updated_at current on any change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- =====================================================================
-- Founding Member program — atomic qualification + award
--
-- This is the piece the local-only prototype explicitly could NOT do
-- (see spec doc): safely answering "am I the 3rd person to qualify,
-- or the 30th?" across every device at once. SELECT ... FOR UPDATE
-- locks the single app_config row for the duration of the check, so
-- two people qualifying in the same instant can't both slip in under
-- the cap — Postgres serializes them.
--
-- Call this after recording a 'post' or 'share' activity day (i.e.
-- after inserting into founding_activity_days) — see record_founding_
-- activity() below, which does both in one call for the client.
-- =====================================================================
create or replace function public.try_award_founding_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_promo_active boolean;
  v_cap          integer;
  v_awarded      integer;
  v_already      boolean;
  v_post_days    integer;
  v_share_days   integer;
  v_signup_age   interval;
begin
  select founding_member_badge into v_already from public.profiles where id = p_user_id;
  if v_already then
    return false;   -- already has it, nothing to do
  end if;

  select trial_started_at into strict v_signup_age from public.profiles where id = p_user_id;
  v_signup_age := now() - v_signup_age;
  if v_signup_age > interval '14 days' then
    return false;   -- window passed
  end if;

  select count(*) into v_post_days
    from public.founding_activity_days
   where user_id = p_user_id and activity_type = 'post';
  select count(*) into v_share_days
    from public.founding_activity_days
   where user_id = p_user_id and activity_type = 'share';

  if v_post_days < 1 or v_share_days < 5 then
    return false;   -- thresholds not met yet
  end if;

  -- Lock the global config row so the cap check + increment are atomic
  -- across concurrent requests from different users.
  select founding_member_promo_active, founding_members_cap, founding_members_awarded_count
    into v_promo_active, v_cap, v_awarded
    from public.app_config
   where id = 1
   for update;

  if not v_promo_active or v_awarded >= v_cap then
    return false;   -- promo off, or all spots already taken
  end if;

  update public.app_config
     set founding_members_awarded_count = founding_members_awarded_count + 1
   where id = 1;

  update public.profiles
     set founding_member_badge = true,
         founding_reward_granted_at = now(),
         subscription_plan = case when subscription_plan = 'none' then 'monthly' else subscription_plan end,
         subscription_expires_at = greatest(coalesce(subscription_expires_at, now()), now()) + interval '90 days'
   where id = p_user_id;

  return true;
end;
$$;

-- Convenience wrapper the client actually calls: records today's
-- activity day (insert is a no-op if already recorded today, thanks
-- to the primary key) and then attempts the award check.
create or replace function public.record_founding_activity(p_user_id uuid, p_activity_type text)
returns boolean
language plpgsql
security definer
as $$
begin
  insert into public.founding_activity_days (user_id, activity_type, activity_day)
  values (p_user_id, p_activity_type, current_date)
  on conflict do nothing;

  return public.try_award_founding_member(p_user_id);
end;
$$;


-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.profiles                enable row level security;
alter table public.app_config               enable row level security;
alter table public.animation_templates      enable row level security;
alter table public.tickle_entries           enable row level security;
alter table public.likes                    enable row level security;
alter table public.comments                 enable row level security;
alter table public.notifications            enable row level security;
alter table public.follows                  enable row level security;
alter table public.tickle_shares            enable row level security;
alter table public.reports                  enable row level security;
alter table public.hidden_posts             enable row level security;
alter table public.favorites                enable row level security;
alter table public.founding_activity_days   enable row level security;
alter table public.goals                    enable row level security;

-- profiles: anyone can read (usernames/avatars are public-ish by
-- nature of the feed); only the owner can update their own row.
create policy "profiles are publicly readable"
  on public.profiles for select using (true);
create policy "users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- app_config: readable by everyone, writable only via the
-- security-definer functions above (no direct client write policy —
-- admin changes go through the Supabase dashboard / service role).
create policy "app_config is publicly readable"
  on public.app_config for select using (true);

-- animation_templates: static reference data, publicly readable.
create policy "animation_templates are publicly readable"
  on public.animation_templates for select using (true);

-- tickle_entries: a person can always see their own entries
-- (regardless of visibility); everyone can see entries marked public.
create policy "entries visible to owner or if public"
  on public.tickle_entries for select
  using (visibility = 'public' or auth.uid() = user_id);
create policy "users can insert their own entries"
  on public.tickle_entries for insert
  with check (auth.uid() = user_id);
create policy "users can update their own entries"
  on public.tickle_entries for update
  using (auth.uid() = user_id);
create policy "users can delete their own entries"
  on public.tickle_entries for delete
  using (auth.uid() = user_id);

-- likes: visible to everyone (needed to compute "who liked this"),
-- but a user can only insert/delete their own like.
create policy "likes are publicly readable"
  on public.likes for select using (true);
create policy "users can like as themselves"
  on public.likes for insert with check (auth.uid() = user_id);
create policy "users can unlike their own like"
  on public.likes for delete using (auth.uid() = user_id);

-- comments: same shape as likes, reserved for when the v2 question
-- is answered.
create policy "comments are publicly readable"
  on public.comments for select using (true);
create policy "users can comment as themselves"
  on public.comments for insert with check (auth.uid() = user_id);
create policy "users can delete their own comments"
  on public.comments for delete using (auth.uid() = user_id);

-- notifications: only visible to the recipient.
create policy "users see only their own notifications"
  on public.notifications for select using (auth.uid() = recipient_id);
create policy "users can mark their own notifications read"
  on public.notifications for update using (auth.uid() = recipient_id);

-- follows: readable by everyone (needed to show follower/following
-- state and feather badges); a user can only create/remove their own
-- follow relationships.
create policy "follows are publicly readable"
  on public.follows for select using (true);
create policy "users can follow as themselves"
  on public.follows for insert with check (auth.uid() = follower_id);
create policy "users can unfollow as themselves"
  on public.follows for delete using (auth.uid() = follower_id);

-- tickle_shares: a user can create shares of entries they can see,
-- and can see their own share history. The unlisted preview page
-- itself is served by a separate public read-only endpoint keyed on
-- share_token (not a client-side table select) — see note below.
create policy "users can view their own shares"
  on public.tickle_shares for select using (auth.uid() = created_by);
create policy "users can create shares as themselves"
  on public.tickle_shares for insert with check (auth.uid() = created_by);

-- reports: a user can create reports and see only their own (not
-- other people's reports, which is a moderator-only view handled via
-- a service role, not exposed to the public API).
create policy "users can view their own reports"
  on public.reports for select using (auth.uid() = reported_by);
create policy "users can report as themselves"
  on public.reports for insert with check (auth.uid() = reported_by);

-- hidden_posts: fully private to the owner.
create policy "users manage their own hidden posts"
  on public.hidden_posts for all using (auth.uid() = user_id);

-- favorites: fully private to the owner (the whole point of Fav's
-- being distinct from public likes).
create policy "users manage their own favorites"
  on public.favorites for all using (auth.uid() = user_id);

-- founding_activity_days: private to the owner; writes only happen
-- via the record_founding_activity() function above (security
-- definer), so no direct insert policy is needed for normal use.
create policy "users can view their own founding activity"
  on public.founding_activity_days for select using (auth.uid() = user_id);

-- goals: fully private to the owner — never shown to anyone else,
-- unlike every other color-carrying thing in this app.
create policy "users manage their own goals"
  on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- =====================================================================
-- Note on tickle_shares' public preview page
-- =====================================================================
-- daytickles.app/t/<token> needs to be reachable with NO login, which
-- is incompatible with the "only the creator can select" policy
-- above (that policy is for the *app's* own share-history view). The
-- actual public preview page should NOT query this table directly
-- from the browser with the anon key; instead, serve it via a
-- Supabase Edge Function (or any small serverless handler) that:
--   1. takes the token from the URL,
--   2. looks up the share + entry using the service role key
--      (bypasses RLS, server-side only),
--   3. returns just the entry's text/mood/animation — never anything
--      else about the author's account.
-- This keeps "no login required to view a shared tickle" working
-- without having to open up tickle_shares (or tickle_entries) to
-- anonymous public reads more broadly than intended.
