-- =====================================================================
-- DayTickles — Six fixed High Five types: add "awesome" and "epic"
--
-- APPLY BY HAND in the Supabase dashboard SQL Editor BEFORE the build
-- that ships the six types goes out. Without it, that build's inserts
-- of 'awesome'/'epic' fail this CHECK silently (optimistic revert +
-- console.error only) after the weekly High Five cap has already been
-- consumed.
--
-- Same drop-and-re-add pattern as 0062: award_type is CHECK-constrained
-- on both awards (the giver's row) and notifications (written by 0020's
-- handle_award_insert trigger, which copies new.award_type through).
-- Every existing id stays allowed -- wordweaver/soulweaver/wittweaver are
-- relabelled in lib/theme.js, not retired, so existing rows stay valid
-- and older builds can still give the four ids they know. Purely
-- additive: harmless to older builds on its own.
--
-- awarded_entries (0054) is a plain view over awards, no constraint --
-- picks up the new ids automatically.
-- =====================================================================

alter table public.awards drop constraint if exists awards_award_type_check;
alter table public.awards add constraint awards_award_type_check
  check (award_type in ('wordweaver','soulweaver','wittweaver','lol','awesome','epic'));

alter table public.notifications drop constraint if exists notifications_award_type_check;
alter table public.notifications add constraint notifications_award_type_check
  check (award_type in ('wordweaver','soulweaver','wittweaver','lol','awesome','epic'));
