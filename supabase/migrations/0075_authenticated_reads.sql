-- 0075_authenticated_reads.sql
--
-- Applied by hand in the SQL editor on 2026-10-11. Restricts SELECT on
-- likes, follows, tales, tale_follows and comments to signed-in users
-- (previously public/anon).

do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('likes','follows','tales','tale_follows','comments')
      and cmd = 'SELECT'
  loop
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
  end loop;
end $$;
