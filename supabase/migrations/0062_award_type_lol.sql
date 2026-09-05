-- =====================================================================
-- DayTickles — Add "LOL" High Five type
--
-- award_type is a real constrained column on TWO tables (migration
-- 0020): awards.award_type (the giver's own row) and
-- notifications.award_type (the recipient's notification, written by
-- migration 0020's own award-notify trigger, which copies new.award_type
-- straight through) -- both need widening or the trigger's insert would
-- fail the moment anyone gives a 'lol' award. No other table/view
-- constrains award_type: awarded_entries (migration 0054) is a plain
-- `select distinct entry_id, award_type from public.awards` view, so it
-- picks up 'lol' automatically once awards allows it.
--
-- Exact constraint names below match migration 0020's own (unnamed
-- inline checks get Postgres's default <table>_<column>_check name) --
-- confirm via pg_constraint before running, same caution as 0061.
-- =====================================================================

alter table public.awards drop constraint awards_award_type_check;
alter table public.awards add constraint awards_award_type_check
  check (award_type in ('wordweaver','soulweaver','wittweaver','lol'));

alter table public.notifications drop constraint notifications_award_type_check;
alter table public.notifications add constraint notifications_award_type_check
  check (award_type in ('wordweaver','soulweaver','wittweaver','lol'));
