-- =====================================================================
-- DayTickles — Photo-Only Tickle type (Part 4 fix: object insert fails
-- RETURNING visibility, same bug class as 0057, different table)
--
-- Migration 0056 added INSERT/UPDATE policies on storage.objects but no
-- SELECT policy. Postgres's RETURNING clause requires SELECT privilege
-- on the returned row -- under RLS that means a SELECT policy, entirely
-- separate from the INSERT policy's own WITH CHECK. Supabase's Storage
-- API needs RETURNING on its internal insert to hand back the created
-- object's metadata to the client, so a row that legitimately PASSES
-- the INSERT policy's WITH CHECK can still fail with "new row violates
-- row-level security policy" once Postgres tries to return it -- the
-- same wording as a WITH CHECK failure, because both share the same
-- underlying RLS-visibility machinery. Confirmed structurally (0056 has
-- no SELECT policy on storage.objects) and via documented Postgres
-- RETURNING/RLS behavior; this is the same root cause class as 0057
-- (a write succeeding while a read-visibility requirement downstream of
-- it was never granted), just on storage.objects instead of
-- storage.buckets.
--
-- Deliberately scoped to the object's own owner, NOT broadened to match
-- the bucket's public=true nature (unlike 0057's bucket-metadata fix).
-- Public object DOWNLOADS (a non-owner viewing a public entry's photo)
-- go through Storage's dedicated public-object-serving route
-- (/storage/v1/object/public/...), which bypasses storage.objects RLS
-- entirely for a public bucket -- this policy is never consulted for
-- that path. The only real need for a SELECT policy here is the
-- uploader seeing their own just-written row for RETURNING to succeed;
-- nothing else in this app queries storage.objects directly. Broadening
-- it would grant unrelated object metadata (owner id, timestamps,
-- mimetype) to anyone with no functional need, unlike 0057 where
-- restricting bucket metadata tighter than the already-public objects
-- inside it would have been the pointless, inconsistent choice.
-- =====================================================================

create policy "users can see their own photo-tickle media"
  on storage.objects for select
  using (
    bucket_id = 'photo-tickle-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

comment on policy "users can see their own photo-tickle media" on storage.objects is
  'Needed for RETURNING on the upload/upsert insert to succeed -- without it, a row that legitimately passes the INSERT policy''s WITH CHECK still fails with a row-level-security error once Postgres tries to return it. Public downloads of these objects are unaffected -- they go through the public-object-serving route, which does not consult this policy.';
