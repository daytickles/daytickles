-- =====================================================================
-- DayTickles — Photo-Only Tickle type (Part 4 fix: bucket metadata was
-- invisible to every real client request)
--
-- Migration 0056 created the photo-tickle-media bucket and RLS write
-- policies on storage.objects, but never granted a SELECT policy on
-- storage.buckets itself. storage.buckets is a regular table subject to
-- RLS like any other -- a bucket's own public=true flag only affects
-- whether OBJECT downloads skip auth once a caller already knows the
-- bucket+path, it says nothing about whether the bucket's metadata ROW
-- is selectable. Confirmed live: `select * from storage.buckets where
-- id = 'photo-tickle-media'` found the row instantly via the SQL
-- Editor's postgres role (bypasses RLS), while the Storage API's own
-- bucket-list/bucket-get endpoints -- evaluated under the caller's real
-- role (anon/authenticated), which is what every actual client request
-- uses -- returned an empty list and "NoSuchBucket" respectively. Same
-- root cause hit from three different angles: the app's real upload
-- attempt, a direct bucket-get check, and a full bucket-list check.
--
-- Scoped open (not authenticated-only): the bucket's objects are
-- already public:true for reads, so gating the bucket's own metadata
-- tighter than the objects inside it are configured to be would be an
-- inconsistent, pointless extra restriction -- and a non-owner viewing
-- a public photo-only entry may not always have a live session.
-- =====================================================================

create policy "anyone can see photo-tickle-media's bucket metadata"
  on storage.buckets for select
  using (id = 'photo-tickle-media');

comment on policy "anyone can see photo-tickle-media's bucket metadata" on storage.buckets is
  'Without this, storage.buckets RLS makes the bucket row invisible to every real client request (anon or authenticated) even though it genuinely exists -- see migration 0057''s own header comment for how this was diagnosed.';
