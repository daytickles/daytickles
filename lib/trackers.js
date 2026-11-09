// lib/trackers.js
//
// Private trackers (supabase/migrations/0081_trackers.sql): up to 5
// things a user chooses to keep track of, each rated once a day. The
// user names every tracker; nothing here suggests names. Only the owner
// can read these rows (RLS). Nothing here logs a tracker's name or a
// rating, and nothing else in the app (Your Week, sharing, Ripples,
// notifications) reads them.
//
// method -- how a day is rated, fixed once the tracker exists:
//   'words'  0..4, shown as TRACKER_WORDS
//   'scale'  a whole number 0..10
//   'amount' 0..AMOUNT_MAX, with the user's own optional unit
// Days are LOCAL dates ('YYYY-MM-DD' from lib/week.js's localDateString),
// the same convention as Day Dots. One rating per tracker per day; a
// change is an upsert on (tracker_id, day), clearing deletes the row.
import { supabase } from './supabase';
import { localDateString } from './week';

export const TRACKER_LIMIT = 5;
export const TRACKER_NAME_MAX = 40;
export const TRACKER_UNIT_MAX = 20;
export const TRACKER_WORDS = ['None', 'A little', 'Some', 'A lot', 'Intense'];
export const SCALE_MAX = 10;
export const AMOUNT_MAX = 100000;
// The days the Your trackers page reads: today and the 29 before it.
export const TRACKER_HISTORY_DAYS = 30;
export const TRACKER_LIMIT_MESSAGE = 'You can keep up to 5 trackers.';

// { trackers, error }: the user's trackers in their own order.
export async function listTrackers(userId) {
  const { data, error } = await supabase
    .from('trackers')
    .select('id, name, method, unit, sort_order, created_at')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return { trackers: data || [], error: error || null };
}

// { tracker, error, message }. message is the text to show when it
// failed: the 5-tracker limit gets its own friendly line.
export async function createTracker(userId, { name, method, unit, sortOrder = 0 }) {
  const row = {
    user_id: userId,
    name: name.trim(),
    method,
    unit: method === 'amount' && unit && unit.trim() ? unit.trim() : null,
    sort_order: sortOrder,
  };
  const { data, error } = await supabase.from('trackers').insert(row).select('id, name, method, unit, sort_order, created_at').single();
  if (!error) return { tracker: data, error: null, message: null };
  const limit = /Tracker limit reached/i.test(error.message || '');
  return {
    tracker: null,
    error,
    message: limit ? TRACKER_LIMIT_MESSAGE : "Couldn't add that tracker. Please try again.",
  };
}

// { error, message }: a new name for a tracker (trimmed, 1 to
// TRACKER_NAME_MAX, the same rule as createTracker). Only the name: how a
// tracker is rated, and its unit, are never changed here.
export async function renameTracker(userId, trackerId, name) {
  const trimmed = (name || '').trim();
  if (trimmed.length < 1 || trimmed.length > TRACKER_NAME_MAX) {
    return { error: new Error('invalid name'), message: `A name needs 1 to ${TRACKER_NAME_MAX} characters.` };
  }
  const { data, error } = await supabase
    .from('trackers')
    .update({ name: trimmed })
    .eq('id', trackerId)
    .eq('user_id', userId)
    .select('id');
  if (error || !data || data.length === 0) {
    return { error: error || new Error('not updated'), message: "Couldn't rename this tracker right now." };
  }
  return { error: null, message: null };
}

// { error, message }: deletes a tracker; its ratings go with it (ON
// DELETE CASCADE, migration 0081).
export async function deleteTracker(userId, trackerId) {
  const { data, error } = await supabase
    .from('trackers')
    .delete()
    .eq('id', trackerId)
    .eq('user_id', userId)
    .select('id');
  if (error || !data || data.length === 0) {
    return { error: error || new Error('not deleted'), message: "Couldn't delete this tracker right now." };
  }
  return { error: null, message: null };
}

// { ratings, error }: Map<trackerId, Map<'YYYY-MM-DD', number>> for the
// given trackers, from fromDay (a local date) up to today.
export async function listRatings(userId, trackerIds, fromDay = localDateString(TRACKER_HISTORY_DAYS - 1)) {
  const ratings = new Map(trackerIds.map((id) => [id, new Map()]));
  if (trackerIds.length === 0) return { ratings, error: null };
  const { data, error } = await supabase
    .from('tracker_ratings')
    .select('tracker_id, day, value')
    .eq('user_id', userId)
    .in('tracker_id', trackerIds)
    .gte('day', fromDay)
    .lte('day', localDateString(0));
  if (error) return { ratings, error };
  for (const r of data || []) {
    if (!ratings.has(r.tracker_id)) ratings.set(r.tracker_id, new Map());
    ratings.get(r.tracker_id).set(r.day, Number(r.value));
  }
  return { ratings, error: null };
}

// Returns the Supabase error, or null.
export async function setRating(userId, trackerId, day, value) {
  const { error } = await supabase
    .from('tracker_ratings')
    .upsert({ tracker_id: trackerId, user_id: userId, day, value }, { onConflict: 'tracker_id,day' });
  return error || null;
}

// Returns the Supabase error, or null.
export async function clearRating(trackerId, day) {
  const { error } = await supabase
    .from('tracker_ratings')
    .delete()
    .eq('tracker_id', trackerId)
    .eq('day', day);
  return error || null;
}

// An amount as text: whole numbers plain, otherwise up to 2 decimals.
export function formatAmount(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

// A rating as words: 'Not rated', the word, '6 out of 10', or the amount
// with the tracker's unit.
export function ratingLabel(tracker, value) {
  if (value == null) return 'Not rated';
  if (tracker.method === 'words') return TRACKER_WORDS[value] ?? 'Not rated';
  if (tracker.method === 'scale') return `${value} out of ${SCALE_MAX}`;
  return tracker.unit ? `${formatAmount(value)} ${tracker.unit}` : formatAmount(value);
}

// A typed or stepped amount kept in range, to 2 decimals.
export function clampAmount(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.min(AMOUNT_MAX, Math.max(0, value)) * 100) / 100;
}
