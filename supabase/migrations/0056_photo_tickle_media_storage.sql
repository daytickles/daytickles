-- =====================================================================
-- DayTickles — Photo-Only Tickle type (Part 4 of the feature: upload on
-- public toggle)
--
-- New Storage bucket for photo-only Tickle images, populated only at
-- the moment an existing PRIVATE photo-only entry is toggled public
-- (see lib/photoTickleStorage.js's makePhotoTicklePublic) -- never at
-- creation time. A private photo-only entry never touches Storage at
-- all; its photo stays local-only (device gallery + the per-device
-- pinboard SQLite DB), exactly as already documented on entry_kind/
-- local_photo_filename (migration 0055).
--
-- Bucket is public-read (public=true) since only already-chosen-public
-- content is ever uploaded here in the first place -- no SELECT policy
-- needed, reads bypass RLS entirely for a public bucket. Writes still
-- go through RLS regardless of the public flag, so INSERT/UPDATE are
-- restricted below to each user's own folder.
--
-- Path scheme: {user_id}/{entry_id}.jpg -- one object per entry,
-- deterministic, upsert-friendly (re-toggling the same entry public a
-- second time overwrites the same path rather than accumulating
-- orphans). Going private again does NOT delete the object -- same
-- accepted "doesn't retroactively lock down" risk profile this app's
-- existing unretractable tickle_shares preview links already have; not
-- addressed by this migration.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('photo-tickle-media', 'photo-tickle-media', true)
on conflict (id) do nothing;

-- storage.foldername(name) splits an object path into its folder
-- segments -- [1] is the first segment, the {user_id} prefix each
-- upload path starts with (see makePhotoTicklePublic).
create policy "users can upload their own photo-tickle media"
  on storage.objects for insert
  with check (
    bucket_id = 'photo-tickle-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users can overwrite their own photo-tickle media"
  on storage.objects for update
  using (
    bucket_id = 'photo-tickle-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'photo-tickle-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

comment on policy "users can upload their own photo-tickle media" on storage.objects is
  'Restricts writes to the uploading user''s own folder within this bucket -- read access is governed by the bucket''s public=true flag instead, no SELECT policy needed.';
