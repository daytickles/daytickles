-- 0086_pinned_tickles.sql
-- Private "pin to the top" bookmarks for the Rippled list. A person can pin up
-- to 3 public Tickles (their own or other people's). Only the pinner can see
-- or change their pins. A pin is removed when the Tickle is deleted (cascade),
-- when the account is deleted (cascade), or when the Tickle stops being public.
-- Safe to run more than once.

create table if not exists public.pinned_entries (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  entry_id  uuid not null references public.tickle_entries(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);

create index if not exists pinned_entries_user_pinned_idx
  on public.pinned_entries (user_id, pinned_at desc);
create index if not exists pinned_entries_entry_idx
  on public.pinned_entries (entry_id);

alter table public.pinned_entries enable row level security;
revoke all on public.pinned_entries from public, anon, authenticated;
grant select, insert, delete on public.pinned_entries to authenticated;

drop policy if exists "users read their own pins" on public.pinned_entries;
create policy "users read their own pins"
  on public.pinned_entries for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users pin public tickles" on public.pinned_entries;
create policy "users pin public tickles"
  on public.pinned_entries for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tickle_entries e
      where e.id = entry_id and e.visibility = 'public'
    )
  );

drop policy if exists "users remove their own pins" on public.pinned_entries;
create policy "users remove their own pins"
  on public.pinned_entries for delete to authenticated
  using (auth.uid() = user_id);

-- At most 3 pins per person, enforced here as well as in the app. The advisory
-- lock stops two quick taps from both getting in.
create or replace function public.enforce_pin_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('pinned_entries:' || new.user_id::text));
  if (select count(*) from public.pinned_entries where user_id = new.user_id) >= 3 then
    raise exception 'You can pin up to 3 Tickles.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pinned_entries_cap on public.pinned_entries;
create trigger pinned_entries_cap
  before insert on public.pinned_entries
  for each row execute function public.enforce_pin_cap();

-- When a Tickle stops being public, everyone's pin of it goes.
create or replace function public.remove_pins_when_not_public()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pinned_entries where entry_id = new.id;
  return null;
end;
$$;

drop trigger if exists tickle_entries_remove_pins on public.tickle_entries;
create trigger tickle_entries_remove_pins
  after update of visibility on public.tickle_entries
  for each row
  when (old.visibility is distinct from new.visibility and new.visibility <> 'public')
  execute function public.remove_pins_when_not_public();

revoke execute on function public.enforce_pin_cap() from public, anon, authenticated;
revoke execute on function public.remove_pins_when_not_public() from public, anon, authenticated;
