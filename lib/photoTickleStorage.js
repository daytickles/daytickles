// lib/photoTickleStorage.js
//
// Public-upload mechanic for a photo-only Tickle -- Part 4 of the
// feature (see supabase/migrations/0056). Upload only ever happens at
// the moment an existing PRIVATE photo-only entry is toggled public,
// never at creation time -- a private one stays strictly local-only
// (device gallery + pinBoardDb.js's SQLite DB), matching how the rest
// of this feature already treats "private" (migration 0055's own
// comment on local_photo_filename).

import { supabase } from './supabase';

const PHOTO_TICKLE_BUCKET = 'photo-tickle-media';

// localUri is the caller's own already-resolved local file uri for this
// entry (the same value feed.js/calendar.js/home.js's photoOnlyUris map
// already produces for display and for sharePhotoOnlyEntry) -- this
// function doesn't do any file resolution of its own.
//
// If entry.media_url is already set (re-toggling public a second time,
// e.g. after having gone private and back), the existing upload is
// reused as-is rather than re-uploaded -- the object at this entry's
// path was never deleted when it went private (see migration 0056's own
// comment on that accepted gap).
//
// Uploads first, THEN makes exactly one combined update setting
// media_url + visibility together -- never two separate writes. This
// ordering is the actual point, not a style preference: a public entry
// with no media_url is precisely the bug this exists to fix, so it must
// never be an observable intermediate state, even under a crash or a
// dropped connection between two calls. If the upload itself fails, the
// DB is never touched at all -- the entry stays fully, unambiguously
// private.
export async function makePhotoTicklePublic(entry, localUri) {
  if (!localUri) {
    throw new Error('makePhotoTicklePublic: no local photo available to upload');
  }

  let mediaUrl = entry.media_url;

  if (!mediaUrl) {
    const path = `${entry.user_id}/${entry.id}.jpg`;
    const arraybuffer = await fetch(localUri).then((res) => res.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_TICKLE_BUCKET)
      .upload(path, arraybuffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(PHOTO_TICKLE_BUCKET).getPublicUrl(path);
    mediaUrl = data.publicUrl;
  }

  const { error: updateError } = await supabase
    .from('tickle_entries')
    .update({ media_url: mediaUrl, visibility: 'public' })
    .eq('id', entry.id);
  if (updateError) throw updateError;

  return mediaUrl;
}
