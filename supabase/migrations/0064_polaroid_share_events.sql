-- =====================================================================
-- polaroid_share_events
-- Durable, server-side log of Tickle Pics' captioned polaroid shares
-- (the sharePhoto() flow in lib/sharing.js -- a bare Pin Board photo,
-- not a tickle_entries row, shared via the real "made me smile" /
-- "thought of you" caption picker). Deliberately a separate table from
-- photo_share_events (migration 0022), which already has its own thin
-- "no caption, just a count" contract feeding the Founding Member
-- reward gate -- this table exists specifically so Home's two caption
-- stat pills have a real, queryable, all-time+windowed source, which
-- tickle_shares can't provide for this action (Photo-Only Tickle shares
-- hardcode one caption regardless of content, so tickle_shares.caption
-- mixes unrelated share types together).
-- Deliberately thin: no photo_id, no image/Storage reference, just
-- "this user shared a polaroid with this caption at this time."
-- =====================================================================
create table public.polaroid_share_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  caption     text not null check (caption in ('made_me_smile', 'thought_of_you')),
  created_at  timestamptz not null default now()
);

create index idx_polaroid_share_events_user_caption_time
  on public.polaroid_share_events (user_id, caption, created_at);

alter table public.polaroid_share_events enable row level security;

create policy "users can view their own polaroid share events"
  on public.polaroid_share_events for select using (auth.uid() = user_id);
create policy "users can record their own polaroid share events"
  on public.polaroid_share_events for insert with check (auth.uid() = user_id);
