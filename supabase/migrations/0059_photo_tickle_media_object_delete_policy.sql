-- =====================================================================
-- DayTickles — photo-tickle-media Storage object DELETE policy
-- (same root-cause class as 0057/0058, third instance found in one
-- session: a write-shaped operation silently doing nothing because
-- storage.objects RLS has no policy permitting it, and Postgres does
-- not treat a 0-row DELETE as an error)
--
-- Migration 0056 added INSERT and UPDATE policies on storage.objects
-- for this bucket but no DELETE policy. lib/photoTickleStorage.js's
-- makePhotoTicklePrivate (and deletePhotoTickleMedia) call
-- supabase.storage.from('photo-tickle-media').remove([path]) expecting
-- the object to actually be removed -- under RLS with no DELETE
-- policy, that DELETE matches zero rows, which Postgres treats as a
-- normal successful statement, not an error. The Storage API returns
-- HTTP 200 with nothing deleted, so storage-js's remove() returns
-- { error: null } and the calling code's own error handling never
-- fires. Confirmed live 2026-09-05: a real photo-only entry toggled
-- private still had its storage.objects row present (created_at ===
-- updated_at, no archived_at -- never touched since original upload),
-- while tickle_entries had already correctly flipped to
-- media_url: null, visibility: 'private'. This is a genuine privacy
-- gap, not a cosmetic bug -- the bucket is public-read, so the object
-- stayed downloadable by anyone with the URL despite the app and DB
-- both claiming the entry was private.
-- =====================================================================

create policy "users can delete their own photo-tickle media"
  on storage.objects for delete
  using (
    bucket_id = 'photo-tickle-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

comment on policy "users can delete their own photo-tickle media" on storage.objects is
  'Without this, storage.objects RLS silently no-ops every remove() call for this bucket (0 rows match, Postgres treats that as success, no error surfaces) -- makePhotoTicklePrivate/deletePhotoTickleMedia would believe they deleted the object while it stays live and publicly downloadable. Same bug class as 0057/0058, DELETE instead of SELECT.';
