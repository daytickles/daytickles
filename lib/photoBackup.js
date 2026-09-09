// lib/photoBackup.js
//
// Export/import of this device's local-only photo data (Pin Board
// photos + private Photo-Only Tickle photos never made public) into a
// single portable container file -- the only way any of this data
// leaves the device, since none of it is ever synced to Supabase (see
// lib/pinBoardDb.js's own header comment). A photo-only entry already
// made public is deliberately excluded: its bytes already live in
// Supabase Storage (photo-tickle-media bucket), and every render path
// that resolves a photo-only entry's image (feed.js/calendar.js/home.js's
// own resolvePhotoOnlyUris) already falls back to entry.media_url
// whenever no local copy exists, so omitting it here costs nothing --
// confirmed by reading that fallback, not assumed.
//
// Container format (not zip -- deliberately simple, no compression
// library dependency):
//   [4 bytes]  manifest length, uint32 big-endian
//   [N bytes]  manifest JSON, UTF-8
//   [...]      photo bytes, concatenated back-to-back in manifest.photos[] order
//
// Every read/write of a photo's bytes goes through File.open()'s
// FileHandle in fixed-size chunks (CHUNK_BYTES) -- File's own
// bytes()/base64()/text() convenience methods read an entire file in one
// shot with no cap, which is exactly what this avoids for anything that
// could be a multi-hundred-MB backup. The manifest header itself (at
// most a few KB of JSON even for a large board) is read/written as a
// single readBytes/writeBytes call -- chunking metadata that small buys
// nothing.
//
// ONE DOCUMENTED EXCEPTION: copyPickedFileToLocalCache below, for the
// single moment a backup file picked via File.pickFileAsync() first
// enters this module. Confirmed on-device against a real pick from
// Android's Downloads document provider: File.pickFileAsync() can hand
// back a File backed by a content:// URI rather than a file:// path, and
// BOTH FileHandle.open() and File.copy() reject content:// URIs outright
// ("This method cannot be used with content URIs") -- there is no
// chunked, position/length-aware way to read one through this module's
// File/FileHandle API. copyPickedFileToLocalCache reads such a file
// whole via bytes() (gated by MAX_PICKED_FILE_BYTES below, so this is a
// bounded, refused-if-too-large exception, not an unconditional one) and
// writes it out as a real local file:// copy -- every other read/write
// in this module, including the rest of import's own byte-range copying
// out of that local copy, stays fully chunked.

import { Directory, File, Paths } from 'expo-file-system';
import { supabase } from './supabase';
import { getAllPinnedPhotosWithLinks, addPinnedPhoto, linkPhotoToEntry } from './pinBoardDb';

const FORMAT_VERSION = 1;
const CHUNK_BYTES = 256 * 1024;

// Ceiling for copyPickedFileToLocalCache's one documented whole-file
// read (see this module's own header comment on why that exception
// exists). 400 MB comfortably covers even a large real board -- at
// 2000px/0.85 JPEG (lib/pinBoardPhotos.js's own post-compression
// numbers), a few hundred photos still lands well under this -- while
// still refusing to silently hold something unbounded in memory just
// because the platform gave us no chunked path to read it.
const MAX_PICKED_FILE_BYTES = 400 * 1024 * 1024;

function encodeUint32BE(n) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, n, false);
  return bytes;
}

function decodeUint32BE(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
}

// A hard yield back to the JS event loop -- FileHandle's readBytes/
// writeBytes are synchronous native calls, so without this the whole
// copy loop below would run start-to-finish before React ever gets a
// chance to paint an onProgress update.
function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function copyBytesChunked(sourceHandle, destHandle, byteLength) {
  let remaining = byteLength;
  while (remaining > 0) {
    const chunk = sourceHandle.readBytes(Math.min(CHUNK_BYTES, remaining));
    if (chunk.byteLength === 0) {
      throw new Error('Unexpected end of file while copying photo bytes.');
    }
    destHandle.writeBytes(chunk);
    remaining -= chunk.byteLength;
  }
}

// --- export --------------------------------------------------------------

// Determines which of this account's pinned_photos rows belong in a
// backup, and how big the finished container will be, without writing
// anything yet -- callers use photoCount/totalPhotoBytes to drive a
// determinate progress bar before the real (slower) byte-copying starts.
export async function planPhotoBackup(userId) {
  const photos = await getAllPinnedPhotosWithLinks(userId);

  const allEntryIds = [...new Set(photos.flatMap((p) => p.links.map((l) => l.entryId)))];
  let publicPhotoOnlyIds = new Set();
  if (allEntryIds.length) {
    const { data, error } = await supabase
      .from('tickle_entries')
      .select('id, entry_kind, media_url')
      .eq('user_id', userId)
      .in('id', allEntryIds);
    if (error) throw error;
    publicPhotoOnlyIds = new Set(
      (data || []).filter((e) => e.entry_kind === 'photo_only' && e.media_url).map((e) => e.id)
    );
  }

  // Skip a photo only if EVERY one of its links points at an entry
  // that's already public -- any other link (a plain pinned-to-a-
  // written-Tickle photo, a still-private photo-only entry, or no link
  // at all) means this device is the only copy that exists, so it stays in.
  const included = photos.filter(
    (photo) => photo.links.length === 0 || !photo.links.every((l) => publicPhotoOnlyIds.has(l.entryId))
  );

  let offset = 0;
  const manifestPhotos = [];
  for (const photo of included) {
    const file = new File(photo.file_path);
    if (!file.exists) continue; // stale row pointing at a deleted/moved file -- nothing to back up
    const byteLength = file.size;
    manifestPhotos.push({
      filename: photo.file_path.split('/').pop(),
      offset,
      byteLength,
      pinnedAt: photo.pinned_at,
      pinnedDate: photo.pinned_date,
      links: photo.links,
      sourcePath: photo.file_path, // stripped before serializing to JSON below
    });
    offset += byteLength;
  }

  const manifest = {
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    accountId: userId,
    photos: manifestPhotos.map(({ sourcePath, ...rest }) => rest),
  };

  return {
    manifest,
    manifestPhotos,
    photoCount: manifestPhotos.length,
    totalPhotoBytes: offset,
    skippedPublicCount: photos.length - included.length,
  };
}

// Writes the container to a temp name in Paths.cache, then renames it to
// its final name only once every byte has been written successfully --
// so the presence of a file at the final name is itself proof it's
// complete. If the app is killed or backgrounded past its time budget
// mid-write, the worst case is a stray `.part` file left in the cache
// directory (which the OS can reclaim on its own) with no effect on any
// real local data -- pinBoardDb and the source photo files are never
// touched by export at all.
export async function writePhotoBackupContainer({ manifest, manifestPhotos }, { onProgress } = {}) {
  const dir = Paths.cache;
  const finalName = `daytickles-backup-${Date.now()}.dtbackup`;
  const tempFile = new File(dir, `${finalName}.part`);
  if (tempFile.exists) tempFile.delete();
  tempFile.create();

  const handle = tempFile.open();
  try {
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    handle.writeBytes(encodeUint32BE(manifestBytes.byteLength));
    handle.writeBytes(manifestBytes);

    for (let i = 0; i < manifestPhotos.length; i++) {
      const photo = manifestPhotos[i];
      const sourceHandle = new File(photo.sourcePath).open();
      try {
        copyBytesChunked(sourceHandle, handle, photo.byteLength);
      } finally {
        sourceHandle.close();
      }
      if (onProgress) onProgress({ photoIndex: i + 1, photoCount: manifestPhotos.length });
      await yieldToUI();
    }
  } finally {
    handle.close();
  }

  // tempFile.move() updates tempFile's own `uri` to point at the new
  // location (per expo-file-system's own docs) -- returning tempFile
  // itself here, not a separately-constructed File(dir, finalName)
  // reference, so callers get the guaranteed-correct post-move uri.
  tempFile.move(new File(dir, finalName));
  return tempFile;
}

// --- import --------------------------------------------------------------

// File.pickFileAsync() can hand back a File backed by a content:// URI
// (confirmed on-device against a real pick from Android's Downloads
// document provider: content://com.android.providers.downloads.documents/...)
// rather than a real file:// path. Confirmed on-device that BOTH of the
// obvious chunked-friendly options reject it outright:
// FileHandle.open() and File.copy() each throw "This method cannot be
// used with content URIs" against the exact same real pick. bytes() is
// the only thing that actually reads a content:// source in this
// version of expo-file-system, so it's used here deliberately -- see
// this module's own header comment for why that's an accepted,
// documented exception rather than a quiet rule violation. Refuses
// (throws, no partial local copy left behind) rather than reading
// anything past MAX_PICKED_FILE_BYTES whole into memory.
export async function copyPickedFileToLocalCache(pickedFile) {
  if (pickedFile.size > MAX_PICKED_FILE_BYTES) {
    throw new Error(
      `This backup file is too large to import (${Math.round(pickedFile.size / (1024 * 1024))} MB, ` +
        `limit ${MAX_PICKED_FILE_BYTES / (1024 * 1024)} MB).`
    );
  }

  const bytes = await pickedFile.bytes();
  const localFile = new File(Paths.cache, `daytickles-import-${Date.now()}.dtbackup`);
  localFile.create();
  localFile.write(bytes);
  return localFile;
}

// Opens a picked container and reads just its manifest -- no photo bytes
// are touched yet. Throws on a truncated/corrupt file (declared size
// doesn't match the manifest's own accounting) or an unrecognized
// formatVersion, before any local writing is even considered.
export async function readPhotoBackupManifest(file) {
  const handle = file.open();
  let manifest;
  try {
    const lengthBytes = handle.readBytes(4);
    if (lengthBytes.byteLength < 4) throw new Error('Not a valid DayTickles backup file.');
    const manifestLength = decodeUint32BE(lengthBytes);

    const manifestBytes = handle.readBytes(manifestLength);
    if (manifestBytes.byteLength < manifestLength) throw new Error('Backup file is truncated.');
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));

    if (manifest.formatVersion !== FORMAT_VERSION) {
      throw new Error(
        `This backup was made by a version of DayTickles this app can't read (format ${manifest.formatVersion}).`
      );
    }

    const expectedPhotoBytes = manifest.photos.reduce((sum, p) => sum + p.byteLength, 0);
    const actualPhotoBytes = file.size - 4 - manifestLength;
    if (actualPhotoBytes !== expectedPhotoBytes) {
      throw new Error('Backup file is truncated or corrupted.');
    }
  } finally {
    handle.close();
  }
  return manifest;
}

// Every distinct entryId a manifest's links reference, resolved against
// this account's OWN tickle_entries rows -- deliberately filtered by
// user_id rather than relying on RLS visibility alone, since RLS also
// permits reading another account's public entries, which must never be
// treated as a valid link target for an imported photo.
export async function validManifestEntryIds(manifest, userId) {
  const allEntryIds = [...new Set(manifest.photos.flatMap((p) => p.links.map((l) => l.entryId)))];
  if (!allEntryIds.length) return new Set();

  const { data, error } = await supabase
    .from('tickle_entries')
    .select('id')
    .eq('user_id', userId)
    .in('id', allEntryIds);
  if (error) throw error;
  return new Set((data || []).map((e) => e.id));
}

function getPinBoardDir(userId) {
  return new Directory(Paths.document, `pinboard-${userId}`);
}

// Writes each photo's bytes to a fresh local file BEFORE its
// pinned_photos row is inserted, and only links entries whose id is in
// validEntryIds (already resolved by validManifestEntryIds, called
// before this and before any writing starts here -- see this module's
// own doc comment on why that ordering matters). So an interruption
// partway through can, at worst, leave one orphaned file with no DB row
// pointing at it -- invisible to the app, same class of harmless leak as
// the existing deletePinnedPhoto TODO in lib/pinBoardDb.js -- never a
// board entry pointing at a truncated file. Every photo already fully
// processed before the interruption stays intact and re-running the
// import (accepted as a real possibility -- see the duplicate-photo
// warning shown before this is ever called) simply re-adds it.
export async function importPhotoBackupContainer(userId, file, manifest, validEntryIds, { onProgress } = {}) {
  const dir = getPinBoardDir(userId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  const handle = file.open();
  let importedCount = 0;
  let skippedLinkCount = 0;

  try {
    // Skip past the header (already validated by readPhotoBackupManifest)
    // to reach the start of the photo bytes.
    const lengthBytes = handle.readBytes(4);
    const manifestLength = decodeUint32BE(lengthBytes);
    handle.readBytes(manifestLength);

    for (let i = 0; i < manifest.photos.length; i++) {
      const photoEntry = manifest.photos[i];
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
      const destFile = new File(dir, filename);
      destFile.create();
      const destHandle = destFile.open();
      try {
        copyBytesChunked(handle, destHandle, photoEntry.byteLength);
      } finally {
        destHandle.close();
      }

      const photoId = await addPinnedPhoto(userId, destFile.uri);
      for (const link of photoEntry.links) {
        if (validEntryIds.has(link.entryId)) {
          await linkPhotoToEntry(userId, photoId, link.entryId);
        } else {
          skippedLinkCount++;
        }
      }
      importedCount++;

      if (onProgress) onProgress({ photoIndex: i + 1, photoCount: manifest.photos.length });
      await yieldToUI();
    }
  } finally {
    handle.close();
  }

  return { importedCount, skippedLinkCount };
}
