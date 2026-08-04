// lib/pinBoardDb.js
//
// Local-only Pin Board storage, backed by expo-sqlite — never touches
// Supabase. Photo files live under FileSystem.documentDirectory; this DB
// only stores metadata (file paths, order, pin dates) and the
// photo<->entry link table. photo_entry_links.entry_id references a
// cloud tickle_entries row by id, but that reference exists ONLY here,
// never as a field on the synced row itself — resolvable only on the
// device where the photo actually lives.

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'pinboard.db';

let db = null;

function getDb() {
  if (!db) db = SQLite.openDatabaseSync(DB_NAME);
  return db;
}

export async function initPinBoardDb() {
  const database = getDb();
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS pinned_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      pinned_at TEXT NOT NULL,
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
  `);
}

// --- pinned_photos ---------------------------------------------------

export async function addPinnedPhoto(filePath) {
  const database = getDb();
  const { maxPosition } = await database.getFirstAsync(
    'SELECT COALESCE(MAX(position), -1) AS maxPosition FROM pinned_photos'
  );
  const result = await database.runAsync(
    'INSERT INTO pinned_photos (file_path, pinned_at, position) VALUES (?, ?, ?)',
    filePath,
    new Date().toISOString(),
    maxPosition + 1
  );
  return result.lastInsertRowId;
}

export async function listPinnedPhotos() {
  const database = getDb();
  return database.getAllAsync('SELECT * FROM pinned_photos ORDER BY position ASC');
}

export async function deletePinnedPhoto(photoId) {
  const database = getDb();
  await database.runAsync('DELETE FROM pinned_photos WHERE id = ?', photoId);
}

export async function reorderPinnedPhoto(photoId, newPosition) {
  const database = getDb();
  await database.runAsync(
    'UPDATE pinned_photos SET position = ? WHERE id = ?',
    newPosition,
    photoId
  );
}

// --- photo_entry_links -------------------------------------------------
// One photo can link to many entries, so linking never checks for or
// replaces an existing link — every call inserts a new row.

export async function linkPhotoToEntry(photoId, entryId) {
  const database = getDb();
  await database.runAsync(
    'INSERT INTO photo_entry_links (photo_id, entry_id, linked_at) VALUES (?, ?, ?)',
    photoId,
    entryId,
    new Date().toISOString()
  );
}

export async function unlinkPhotoFromEntry(photoId, entryId) {
  const database = getDb();
  await database.runAsync(
    'DELETE FROM photo_entry_links WHERE photo_id = ? AND entry_id = ?',
    photoId,
    entryId
  );
}

// Powers the "Tickled" badge — true if the photo has at least one link.
export async function photoHasLinks(photoId) {
  const database = getDb();
  const row = await database.getFirstAsync(
    'SELECT 1 FROM photo_entry_links WHERE photo_id = ? LIMIT 1',
    photoId
  );
  return !!row;
}

// Reverse lookup for EntryCard's photo indicator icon.
export async function getPhotoForEntry(entryId) {
  const database = getDb();
  return database.getFirstAsync(
    `SELECT pinned_photos.* FROM photo_entry_links
     JOIN pinned_photos ON pinned_photos.id = photo_entry_links.photo_id
     WHERE photo_entry_links.entry_id = ?
     LIMIT 1`,
    entryId
  );
}
