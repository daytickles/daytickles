// lib/polaroidsSent.js
//
// Home's Polaroids sent card: the newest Polaroids sent from Tickle Pics
// on THIS phone. The only record linking a send to its photo is the
// local photo_shares table (lib/pinBoardDb.js, written by sharePhoto in
// lib/sharing.js), so nothing here touches Supabase. Each item is rebuilt
// from that row: the Pin Board photo, the saved caption and, when shown,
// the user's accent colour for the divider dot (as ShareCard draws it).
//
// Thumbnails: a small JPEG (THUMB_WIDTH px wide) per photo, made once
// with expo-image-manipulator and cached on disk, so the card's ticker
// never decodes a full camera photo. A photo whose file is missing on
// the phone is skipped, never an error.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { initPinBoardDb, listRecentPhotoShares } from './pinBoardDb';
import { SHARE_CAPTIONS } from './sharing';

export const POLAROIDS_SENT_LIMIT = 10;
const THUMB_WIDTH = 280;
const THUMB_JPEG_QUALITY = 0.8;
// Shares read per load, so skipped (missing) photos can still leave
// POLAROIDS_SENT_LIMIT items to show.
const SHARES_READ = POLAROIDS_SENT_LIMIT * 3;

// One cache folder per account, like the Pin Board's own folders.
function thumbDir(userId) {
  const dir = new Directory(Paths.cache, `polaroid-thumbs-${userId}`);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// A short, stable tag for a file path, so a relinked photo (a new
// file_path for the same photo id) gets a new thumbnail.
function pathTag(path) {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// The cached thumbnail's uri for a photo, made now if it isn't there.
async function thumbnailFor(userId, photoId, filePath) {
  const dest = new File(thumbDir(userId), `${photoId}-${pathTag(filePath)}.jpg`);
  if (dest.exists) return dest.uri;
  const context = ImageManipulator.manipulate(filePath);
  context.resize({ width: THUMB_WIDTH });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ compress: THUMB_JPEG_QUALITY, format: SaveFormat.JPEG });
  const made = new File(result.uri);
  try {
    made.copy(dest);
  } catch (err) {
    // Another load (a Home focus and a pull-down refresh at once) made
    // the same thumbnail first: use that one.
    if (dest.exists) return dest.uri;
    throw err;
  }
  try {
    made.delete();
  } catch {
    // the manipulator's own temp file; the OS clears the cache anyway
  }
  return dest.uri;
}

// Newest first, at most POLAROIDS_SENT_LIMIT:
// [{ id, captionLabel, createdAt, photo: { id, file_path }, thumbUri }].
// A photo that's missing, or whose thumbnail can't be made, is skipped.
export async function loadSentPolaroids(userId) {
  await initPinBoardDb(userId);
  const rows = await listRecentPhotoShares(userId, SHARES_READ);
  const items = [];
  for (const row of rows) {
    if (items.length >= POLAROIDS_SENT_LIMIT) break;
    try {
      if (!row.file_path || !new File(row.file_path).exists) continue;
      const thumbUri = await thumbnailFor(userId, row.photo_id, row.file_path);
      const caption = SHARE_CAPTIONS.find((c) => c.id === row.caption);
      items.push({
        id: String(row.share_id),
        captionLabel: caption ? caption.label : '',
        createdAt: row.created_at,
        photo: { id: row.photo_id, file_path: row.file_path },
        thumbUri,
      });
    } catch {
      // skipped: missing or unreadable photo
    }
  }
  return items;
}
