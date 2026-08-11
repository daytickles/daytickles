-- =====================================================================
-- Founding Member program v2 — Stage 2 (month-success computation).
--
-- Read-only progress counts for one user's checkpoint window, either
-- the in-progress current month (live display) or a closed past month
-- (evaluation). No state transitions here -- restart/fail/complete are
-- a later stage.
--
-- SECURITY INVOKER, not DEFINER: it runs as the calling session, so
-- every underlying query is still filtered by that table's own RLS
-- policy (auth.uid() = user_id, etc). Passing someone else's
-- p_user_id doesn't leak their data -- it just returns their own
-- all-zero counts, since RLS still keys off the caller's real
-- auth.uid(), not the parameter. A later stage's server-side sweep
-- (evaluating every active enrollment, not just "my own") will need a
-- separate SECURITY DEFINER variant; this one is for self-service
-- reads only.
--
-- "Photos shared" combines tickle_shares (entry shares, photo-linked
-- or not) and photo_share_events (bare Pin Board photo shares) --
-- both represent "left the app via the OS share sheet", per the
-- spec's stated purpose for this requirement, and are otherwise
-- disjoint (confirmed during audit: sharing a photo-linked entry
-- never writes to photo_share_events, and vice versa).
-- =====================================================================
create or replace function public.compute_founding_member_month_progress(
  p_user_id uuid,
  p_start_date date,
  p_end_date_exclusive date,
  p_start_utc timestamptz,
  p_end_utc_exclusive timestamptz
)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'shared_to_feed_count', (
      select count(*) from public.tickle_entries
       where user_id = p_user_id and visibility = 'public'
         and entry_date >= p_start_date and entry_date < p_end_date_exclusive
    ),
    'photos_shared_count', (
      (select count(*) from public.tickle_shares
        where created_by = p_user_id
          and created_at >= p_start_utc and created_at < p_end_utc_exclusive)
      +
      (select count(*) from public.photo_share_events
        where user_id = p_user_id
          and shared_at >= p_start_utc and shared_at < p_end_utc_exclusive)
    ),
    'likes_given_count', (
      select count(*) from public.likes
       where user_id = p_user_id
         and created_at >= p_start_utc and created_at < p_end_utc_exclusive
    ),
    'favorited_count', (
      select count(*) from public.favorites
       where user_id = p_user_id
         and created_at >= p_start_utc and created_at < p_end_utc_exclusive
    ),
    'made_me_smile_count', (
      select count(*) from public.tickle_entries
       where user_id = p_user_id and tickle_nature = 'received'
         and entry_date >= p_start_date and entry_date < p_end_date_exclusive
    ),
    'paying_forward_count', (
      select count(*) from public.tickle_entries
       where user_id = p_user_id and tickle_nature = 'given'
         and entry_date >= p_start_date and entry_date < p_end_date_exclusive
    ),
    'mood_boost_count', (
      select count(*) from public.tickle_entries
       where user_id = p_user_id and tickle_nature = 'self'
         and entry_date >= p_start_date and entry_date < p_end_date_exclusive
    )
  );
$$;
