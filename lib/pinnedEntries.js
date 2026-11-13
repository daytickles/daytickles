// lib/pinnedEntries.js
//
// Pinned Tickles: up to 3 public Tickles a person keeps at the top of the
// Rippled list (supabase/migrations/0086_pinned_tickles.sql). Pins are
// private to the person who made them (RLS: own rows only). The database
// enforces the limit of 3 (error code 23514, "You can pin up to 3
// Tickles.") and removes a pin when its Tickle is deleted or stops being
// public. Every helper returns its result and never throws.

import { supabase } from './supabase';

export const PIN_LIMIT = 3;

// True for the database's "at most 3 pins" refusal (enforce_pin_cap).
export function isPinLimitError(error) {
  if (!error) return false;
  return error.code === '23514' || /up to 3/i.test(error.message || '');
}

// The user's pinned entry ids as an array, newest pin first. null when
// the read fails, so the caller can keep what it already shows (the same
// as feed.js's favourites, which only update on success).
export async function fetchPinnedIds(userId) {
  try {
    const { data, error } = await supabase
      .from('pinned_entries')
      .select('entry_id, pinned_at')
      .eq('user_id', userId)
      .order('pinned_at', { ascending: false });
    if (error) return null;
    return (data || []).map((row) => row.entry_id);
  } catch {
    return null;
  }
}

// Pins one public Tickle. Returns { error }.
export async function pinEntry(userId, entryId) {
  try {
    const { error } = await supabase
      .from('pinned_entries')
      .insert({ user_id: userId, entry_id: entryId });
    return { error: error || null };
  } catch (error) {
    return { error };
  }
}

// Removes one pin. Returns { error }.
export async function unpinEntry(userId, entryId) {
  try {
    const { error } = await supabase
      .from('pinned_entries')
      .delete()
      .eq('user_id', userId)
      .eq('entry_id', entryId);
    return { error: error || null };
  } catch (error) {
    return { error };
  }
}
