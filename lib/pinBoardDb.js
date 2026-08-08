// lib/pinBoardDb.js
//
// Local-only Pin Board storage, backed by expo-sqlite — never touches
// Supabase. Photo files live under FileSystem.documentDirectory; this DB
// only stores metadata (file paths, order, pin dates) and the
// photo<->entry link table. photo_entry_links.entry_id references a
// cloud tickle_entries row by id, but that reference exists ONLY here,
// never as a field on the synced row itself — resolvable only on the
// device where the photo actually lives.
//
// One SQLite file per account (pinboard-${userId}.db), not one shared
// file — a shared file was a real cross-account data leak (one account's
// pinned photos and links were readable/writable by any other account on
// the same device). Every exported function below takes userId as its
// first argument for this reason; there is no "current user" implicit
// state anywhere in this module.

import * as SQLite from 'expo-sqlite';
import { localDateString, toLocalDateString } from './week';

// Keyed by userId rather than a single cached handle — if one account
// signs out and a different account signs in within the same app
// session (no restart), each still gets its own connection instead of
// silently reusing the previous account's cached db.
const dbCache = new Map();

function getDb(userId) {
  if (!dbCache.has(userId)) {
    dbCache.set(userId, SQLite.openDatabaseSync(`pinboard-${userId}.db`));
  }
  return dbCache.get(userId);
}

export async function initPinBoardDb(userId) {
  const database = getDb(userId);
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS pinned_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      pinned_at TEXT NOT NULL,
      pinned_date TEXT,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS photo_entry_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL REFERENCES pinned_photos(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      linked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_links_photo_id ON photo_entry_links(photo_id);
    CREATE INDEX IF NOT EXISTS idx_links_entry_id ON photo_entry_links(entry_id);

    CREATE TABLE IF NOT EXISTS photo_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL REFERENCES pinned_photos(id) ON DELETE CASCADE,
      caption TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Devices with an existing pinned_photos table from before this column
  // existed won't pick it up from CREATE TABLE IF NOT EXISTS above --
  // add it explicitly; harmlessly fails with "duplicate column" on every
  // run after the first.
  try {
    await database.execAsync('ALTER TABLE pinned_photos ADD COLUMN pinned_date TEXT');
  } catch {
    // already added on a previous call
  }

  // One-time backfill for photos pinned before pinned_date existed,
  // computed from each row's own pinned_at via the same local-time
  // helper used everywhere else (lib/week.js) rather than trusting a
  // SQL-level conversion. WHERE pinned_date IS NULL makes this a cheap
  // no-op on every call after the first real backfill.
  const staleRows = await database.getAllAsync(
    'SELECT id, pinned_at FROM pinned_photos WHERE pinned_date IS NULL'
  );
  for (const row of staleRows) {
    await database.runAsync(
      'UPDATE pinned_photos SET pinned_date = ? WHERE id = ?',
      toLocalDateString(new Date(row.pinned_at)),
      row.id
    );
  }
}

// --- pinned_photos ---------------------------------------------------

export async function addPinnedPhoto(userId, filePath) {
  const database = getDb(userId);
  const { maxPosition } = await database.getFirstAsync(
    'SELECT COALESCE(MAX(position), -1) AS maxPosition FROM pinned_photos'
  );
  const result = await database.runAsync(
    'INSERT INTO pinned_photos (file_path, pinned_at, pinned_date, position) VALUES (?, ?, ?, ?)',
    filePath,
    new Date().toISOString(),
    localDateString(),
    maxPosition + 1
  );
  return result.lastInsertRowId;
}

export async function listPinnedPhotos(userId) {
  const database = getDb(userId);
  return database.getAllAsync('SELECT * FROM pinned_photos ORDER BY position DESC');
}

// Powers the Calendar's photo-presence marker — same visible-month range
// the tickle-count query already uses, cross-referenced against
// pinned_date (a local calendar-date string, not the raw pinned_at
// instant) rather than any entry link (a day can have a photo with no
// tickle yet).
export async function getPinnedPhotoDatesInRange(userId, startDate, endDate) {
  const database = getDb(userId);
  const rows = await database.getAllAsync(
    'SELECT DISTINCT pinned_date AS d FROM pinned_photos WHERE pinned_date BETWEEN ? AND ?',
    startDate,
    endDate
  );
  return rows.map((r) => r.d);
}

// Total pinned photos on/after a given local date -- powers Weekly
// Summary's "photos added this week" count. Distinct from
// getPinnedPhotoDatesInRange above, which returns DISTINCT dates (for
// calendar day-badges) rather than a raw count of photos.
export async function getPinnedPhotoCountSince(userId, sinceDate) {
  const database = getDb(userId);
  const { count } = await database.getFirstAsync(
    'SELECT COUNT(*) AS count FROM pinned_photos WHERE pinned_date >= ?',
    sinceDate
  );
  return count;
}

// TODO(pin-board delete UI): this only removes the DB row — the actual
// photo file under Paths.document/pinboard-${userId} is never deleted,
// so every call orphans a file on disk. No caller does this yet (no
// delete-photo UI exists), so it's latent, not yet triggered. Once that
// UI is built, fetch the row's file_path first and pass it to
// deletePinBoardPhotoFile (lib/pinBoardPhotos.js) alongside this call.
export async function deletePinnedPhoto(userId, photoId) {
  const database = getDb(userId);
  await database.runAsync('DELETE FROM pinned_photos WHERE id = ?', photoId);
}

export async function reorderPinnedPhoto(userId, photoId, newPosition) {
  const database = getDb(userId);
  await database.runAsync(
    'UPDATE pinned_photos SET position = ? WHERE id = ?',
    newPosition,
    photoId
  );
}

// --- photo_entry_links -------------------------------------------------
// One photo can link to many entries, so linking never checks for or
// replaces an existing link — every call inserts a new row.

export async function linkPhotoToEntry(userId, photoId, entryId) {
  const database = getDb(userId);
  await database.runAsync(
    'INSERT INTO photo_entry_links (photo_id, entry_id, linked_at) VALUES (?, ?, ?)',
    photoId,
    entryId,
    new Date().toISOString()
  );
}

export async function unlinkPhotoFromEntry(userId, photoId, entryId) {
  const database = getDb(userId);
  await database.runAsync(
    'DELETE FROM photo_entry_links WHERE photo_id = ? AND entry_id = ?',
    photoId,
    entryId
  );
}

// Powers the "Tickled" badge — true if the photo has at least one link.
export async function photoHasLinks(userId, photoId) {
  const database = getDb(userId);
  const row = await database.getFirstAsync(
    'SELECT 1 FROM photo_entry_links WHERE photo_id = ? LIMIT 1',
    photoId
  );
  return !!row;
}

// Reverse lookup for EntryCard's photo indicator icon.
export async function getPhotoForEntry(userId, entryId) {
  const database = getDb(userId);
  return database.getFirstAsync(
    `SELECT pinned_photos.* FROM photo_entry_links
     JOIN pinned_photos ON pinned_photos.id = photo_entry_links.photo_id
     WHERE photo_entry_links.entry_id = ?
     LIMIT 1`,
    entryId
  );
}

// One cheap membership check per list load, instead of a query per
// visible EntryCard — callers build a Set from this and pass down
// hasLinkedPhoto={set.has(item.id)}, only resolving the actual photo
// (getPhotoForEntry) lazily on tap.
export async function getAllLinkedEntryIds(userId) {
  const database = getDb(userId);
  const rows = await database.getAllAsync('SELECT DISTINCT entry_id FROM photo_entry_links');
  return rows.map((r) => r.entry_id);
}

// Same idea as getAllLinkedEntryIds, but for the Pin Board screen's own
// "Tickled" badges — one query per board load instead of one per card.
export async function getLinkedPhotoIds(userId) {
  const database = getDb(userId);
  const rows = await database.getAllAsync('SELECT DISTINCT photo_id FROM photo_entry_links');
  return rows.map((r) => r.photo_id);
}

// --- photo_shares --------------------------------------------------
// Local-only record of a Pin Board photo share (which caption was
// used, when) -- tickle_shares (Supabase) only ever covers shares of
// an actual entry; a bare photo share has no entry to attach to there,
// so without this there'd be no queryable record of it anywhere.
// Mirrors tickle_shares' shape (caption id + timestamp) closely enough
// that Weekly Summary can treat the two as one combined count.
export async function recordPhotoShare(userId, photoId, captionId) {
  const database = getDb(userId);
  await database.runAsync(
    'INSERT INTO photo_shares (photo_id, caption, created_at) VALUES (?, ?, ?)',
    photoId,
    captionId,
    new Date().toISOString()
  );
}

// Total photo shares of a given caption on/after a given instant --
// summed with tickle_shares' equivalent cloud-side count to give
// Weekly Summary's full "thought of you" total (see recordPhotoShare's
// own comment for why entry shares and photo shares are tracked in
// two separate places).
export async function getPhotoShareCountSince(userId, sinceISO, captionId) {
  const database = getDb(userId);
  const { count } = await database.getFirstAsync(
    'SELECT COUNT(*) AS count FROM photo_shares WHERE caption = ? AND created_at >= ?',
    captionId,
    sinceISO
  );
  return count;
}
