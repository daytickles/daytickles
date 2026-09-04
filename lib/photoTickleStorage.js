// lib/photoTickleStorage.js
//
// Public-upload mechanic for a photo-only Tickle -- Part 4 of the
// feature (see supabase/migrations/0056). Upload only ever happens at
// the moment an existing PRIVATE photo-only entry is toggled public,
// never at creation time -- a private one stays strictly local-only
// (device gallery + pinBoardDb.js's SQLite DB), matching how the rest
// of this feature already treats "private" (migration 0055's own
// comment on local_photo_filename).

import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

const PHOTO_TICKLE_BUCKET = 'photo-tickle-media';

// Public uploads are resized/recompressed before going to Storage -- the
// Polaroid only ever renders at a few hundred dp wide in Feed/Calendar,
// so uploading full camera-resolution originals wastes Storage cost,
// upload time, and downloader bandwidth for no visible benefit. 1600px
// longest edge / quality 0.75 chosen from real measurements against an
// actual test photo (3468x3468 original, 1.3MB -> 1600x1600, ~290KB --
// a ~4.5x reduction), not a rule-of-thumb guess.
const PUBLIC_UPLOAD_MAX_DIMENSION = 1600;
const PUBLIC_UPLOAD_JPEG_QUALITY = 0.75;

// expo-image-manipulator's resize() only takes explicit target
// dimensions -- there's no built-in "cap the longest edge" mode, and
// nothing exposes the source image's own size before resizing. Image
// .getSize (plain React Native, works for local file:// URIs, not an
// Expo module) reads the real original dimensions first so the scale
// factor is correct for both portrait and landscape, not just square
// photos like the one this was measured against.
//
// Reads localUri only, never touches it -- expo-image-manipulator
// always writes its result to a brand-new file ("Each invocation
// results in a new file", per its own docs), so the caller's local
// device copy (the gallery-saved original that EntryCard's Polaroid
// actually displays from) is untouched regardless of what happens here.
async function resizeForPublicUpload(localUri) {
  const { width, height } = await new Promise((resolve, reject) => {
    Image.getSize(localUri, (w, h) => resolve({ width: w, height: h }), reject);
  });

  const longestEdge = Math.max(width, height);
  const scale = longestEdge > PUBLIC_UPLOAD_MAX_DIMENSION ? PUBLIC_UPLOAD_MAX_DIMENSION / longestEdge : 1;

  const context = ImageManipulator.manipulate(localUri);
  context.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ compress: PUBLIC_UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
  return result.uri;
}

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
    const uploadUri = await resizeForPublicUpload(localUri);
    const arraybuffer = await fetch(uploadUri).then((res) => res.arrayBuffer());

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
