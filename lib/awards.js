// lib/awards.js
//
// Shared High Five reads. Moved from app/(tabs)/feed.js so Weekly Summary
// can show the same badge.

import { supabase } from './supabase';

// Map<entryId, string[]> -- distinct award types (from ANY giver) each
// entry has actually received (see migration 0054's awarded_entries
// view: entry id and award type only, never who gave it). A failed query
// resolves an empty Map, so callers just show no badge.
//
// Tickle Stash calls it from inside loadFeed itself, right alongside
// setEntries, rather than as a separate effect reacting to `entries` --
// that shape used to fire a second render right after every content
// refresh; calling it there lets both land in the same batch instead.
export async function fetchAwardedEntryTypes(entryIds) {
  if (entryIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('awarded_entries')
    .select('entry_id, award_type')
    .in('entry_id', entryIds);
  if (error) return new Map();
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.entry_id)) map.set(row.entry_id, []);
    map.get(row.entry_id).push(row.award_type);
  }
  return map;
}
