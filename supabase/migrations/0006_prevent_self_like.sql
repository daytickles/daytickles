-- =====================================================================
-- DayTickles — migration: prevent self-likes
-- The like button had no ownership gate, so a person could like their
-- own entry — inflating their own like_count and, combined with the
-- share flow, self-generating social proof. feed.js now hides the like
-- control on your own entries (mirroring how the Follow button is
-- already hidden there), but that's client-side only; any authenticated
-- client can call the likes API directly, so the real gate has to live
-- here. A plain CHECK constraint can't express this — it would need to
-- read tickle_entries.user_id, and CHECK constraints can only see
-- columns on the row being written — so this needs a BEFORE INSERT
-- trigger instead.
--
-- Confirmed live via anon-key probe before writing this: joining likes
-- to tickle_entries where likes.user_id = tickle_entries.user_id found
-- 4 pre-existing self-like rows (all by the same user, on entries
-- "Nc17"/"Nc15"/"Nc14"/"Nc12"). That probe could only see public
-- entries (RLS on tickle_entries hides private ones from the
-- unauthenticated anon key), so the cleanup below is intentionally not
-- scoped to public — it runs unrestricted here and catches self-likes
-- on private entries too, if any exist. Deleting through `likes`
-- rather than hand-adjusting the counter lets the existing
-- handle_like_delete trigger correct each affected entry's like_count
-- automatically, same as any other unlike.
-- =====================================================================

delete from public.likes l
using public.tickle_entries e
where l.entry_id = e.id
  and l.user_id = e.user_id;

create or replace function public.prevent_self_like()
returns trigger
language plpgsql
security definer
as $$
declare
  entry_owner uuid;
begin
  select user_id into entry_owner from public.tickle_entries where id = new.entry_id;

  if entry_owner = new.user_id then
    raise exception 'Cannot like your own entry';
  end if;

  return new;
end;
$$;

create trigger prevent_self_like_insert
  before insert on public.likes
  for each row execute function public.prevent_self_like();
