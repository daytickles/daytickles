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

// Shared by deletePhotoTickleMedia and makePhotoTicklePrivate below --
// same path formula makePhotoTicklePublic uploads to. The two callers
// differ only in how they react to a failure (best-effort/log vs.
// throw), not in how the object is located.
function removePhotoTickleObject(entry) {
  const path = `${entry.user_id}/${entry.id}.jpg`;
  return supabase.storage.from(PHOTO_TICKLE_BUCKET).remove([path]);
}

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
// If entry.media_url is already set, the existing upload is reused
// as-is rather than re-uploaded. In practice this now only happens if
// this function is somehow called on an entry that's already public
// (a no-op re-publish) -- makePhotoTicklePrivate below genuinely
// deletes the Storage object AND clears media_url when an entry goes
// private, so a real "went private and back" re-publish always
// re-uploads from scratch. That's a deliberate reversal of this
// feature's original trade-off (leaving the old object orphaned on
// unpublish, accepted at the time) -- since the bucket is fully
// public-read, an orphaned object would still be servable by URL alone
// regardless of what tickle_entries.visibility says, so "private" needs
// to genuinely mean private. The lost re-upload efficiency is the
// accepted cost of that real privacy guarantee.
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

// Best-effort cleanup for a photo-only entry's uploaded Storage object,
// called alongside (not blocking) the entry's own tickle_entries delete
// -- see each screen's own handleDeleteEntry. Deliberately never throws
// -- a Storage cleanup failure is real but unrelated to the user's own
// delete action, which proceeds either way; failure is only logged, not
// surfaced, same reasoning as this app's other best-effort paths (e.g.
// home.js's reminder-scheduling reconciliation). No-op if the entry was
// never public (no media_url means nothing was ever uploaded -- see
// makePhotoTicklePublic above).
//
// Deliberately NOT reused for makePhotoTicklePrivate below, even though
// both remove the same object -- the two calls have opposite failure
// philosophies (best-effort/log here vs. must-succeed-or-throw there),
// and collapsing them into one function would mean picking one
// behavior and getting it wrong for the other caller.
export async function deletePhotoTickleMedia(entry) {
  if (entry.entry_kind !== 'photo_only' || !entry.media_url) return;

  const { error } = await removePhotoTickleObject(entry);
  if (error) {
    console.error('deletePhotoTickleMedia: Storage cleanup failed, object left orphaned', error);
  }
}

// Reverses makePhotoTicklePublic -- removes the Storage object AND
// clears media_url in the SAME combined update, mirroring that
// function's own upload-first-then-combined-update safety ordering,
// just in reverse: the object is removed from Storage FIRST, and only
// once that's genuinely succeeded does the DB get updated to claim
// "private". If the Storage removal fails, this throws and the DB is
// never touched -- the entry stays visibly, honestly public rather than
// falsely claiming a privacy it doesn't actually have. This is NOT
// best-effort like deletePhotoTickleMedia above: the entire point of
// this function is a genuine privacy guarantee, so silently leaving the
// object live while telling the user it's private would recreate
// exactly the bug this exists to fix.
export async function makePhotoTicklePrivate(entry) {
  if (entry.media_url) {
    const { error } = await removePhotoTickleObject(entry);
    if (error) throw error;
  }

  const { error: updateError } = await supabase
    .from('tickle_entries')
    .update({ media_url: null, visibility: 'private' })
    .eq('id', entry.id);
  if (updateError) throw updateError;
}
