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
    .select(TRACKER_SELECT)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return { trackers: data || [], error: error || null };
}

// The columns every tracker read returns (unit_plural: migration 0085).
const TRACKER_SELECT = 'id, name, method, unit, unit_plural, sort_order, created_at';

// An amount tracker's unit and its "more than one" form, as saved: both
// trimmed; unit null when empty; unit_plural null when empty, the same as
// the unit, or when there is no unit (migration 0085's checks).
function cleanUnits(unit, unitPlural) {
  const u = (unit || '').trim();
  const p = (unitPlural || '').trim();
  return {
    unit: u || null,
    unit_plural: u && p && p !== u ? p : null,
  };
}

// { tracker, error, message }. message is the text to show when it
// failed: the 5-tracker limit gets its own friendly line. unitPlural is
// the unit for any amount other than 1 (e.g. cups); amount trackers only.
export async function createTracker(userId, { name, method, unit, unitPlural, sortOrder = 0 }) {
  const units = method === 'amount' ? cleanUnits(unit, unitPlural) : { unit: null, unit_plural: null };
  const row = {
    user_id: userId,
    name: name.trim(),
    method,
    unit: units.unit,
    unit_plural: units.unit_plural,
    sort_order: sortOrder,
  };
  const { data, error } = await supabase.from('trackers').insert(row).select(TRACKER_SELECT).single();
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
// tracker is rated is never changed, and the unit has updateTrackerUnit.
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

// { error, message, unit, unit_plural }: a new unit and "more than one"
// form for an amount tracker (cleaned as in createTracker; clearing the
// unit clears the plural too). Updates only those two columns; ratings
// are untouched. unit / unit_plural are the values as saved.
export async function updateTrackerUnit(trackerId, unit, unitPlural) {
  const units = cleanUnits(unit, unitPlural);
  const { data, error } = await supabase
    .from('trackers')
    .update(units)
    .eq('id', trackerId)
    .select('id');
  if (error || !data || data.length === 0) {
    return { error: error || new Error('not updated'), message: "Couldn't change the unit right now.", ...units };
  }
  return { error: null, message: null, ...units };
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

// The unit to show next to an amount. shownNumber is the number as it is
// DISPLAYED (formatAmount's string, or the one-decimal string of an
// average), so 1, 1.0 and an average shown as "1" take the unit, and
// everything else ("0", "0.5", "1.5", "2") takes unit_plural -- or the
// unit as typed when there is no plural (every tracker made before 0085).
// '' when the tracker has no unit.
export function unitFor(tracker, shownNumber) {
  if (!tracker?.unit) return '';
  if (shownNumber === '1') return tracker.unit;
  return tracker.unit_plural || tracker.unit;
}

// A rating as words: 'Not rated', the word, '6 out of 10', or the amount
// with the tracker's unit (singular for 1, see unitFor).
export function ratingLabel(tracker, value) {
  if (value == null) return 'Not rated';
  if (tracker.method === 'words') return TRACKER_WORDS[value] ?? 'Not rated';
  if (tracker.method === 'scale') return `${value} out of ${SCALE_MAX}`;
  const shown = formatAmount(value);
  const unit = unitFor(tracker, shown);
  return unit ? `${shown} ${unit}` : shown;
}

// ---------------------------------------------------------------------
// suggestPlural(unit): a SUGGESTION for the "More than one" box while the
// user types a unit (tracker_unit_audit.md, section 5). English only and
// right for common words; the user can change or clear it. '' means "no
// suggestion" (the unit is then shown as typed for every amount).
//   - short symbols and abbreviations (2 characters or fewer, or in
//     PLURAL_SYMBOLS), anything with no letters or with a digit, a phrase
//     that starts with a symbol ("km walked") or ends in an -ed word: ''
//   - "X of Y": only X changes ("cup of tea" -> "cups of tea")
//   - otherwise the last word: irregulars, same-in-both words, vowel + z
//     -> zzes, ss/us/is/x/z/ch/sh -> +es, another final s stays (already
//     plural), consonant + y -> ies, else +s
// Matching uses a space-collapsed, lower-case copy; a capitalised word
// keeps its capital and an all-caps word gets capital endings.
// ---------------------------------------------------------------------
const PLURAL_SYMBOLS = new Set([
  'ml', 'cl', 'dl', 'l', 'g', 'kg', 'mg', 'oz', 'lb', 'lbs', 'km', 'm', 'cm', 'mm', 'mi', 'ft', 'in',
  'kcal', 'cal', 'h', 'hr', 'hrs', 'min', 'mins', 'sec', 'secs', 's', 'x', '%', 'pt', 'pts', 'bpm',
]);
const PLURAL_IRREGULAR = {
  person: 'people', child: 'children', foot: 'feet', tooth: 'teeth', mouse: 'mice', man: 'men',
  woman: 'women', leaf: 'leaves', loaf: 'loaves', half: 'halves', knife: 'knives', life: 'lives',
  shelf: 'shelves',
};
const PLURAL_SAME = new Set([
  'sheep', 'fish', 'deer', 'series', 'species', 'water', 'tea', 'coffee', 'milk', 'sleep', 'music',
  'sugar', 'rice', 'bread', 'juice', 'news',
]);

function pluralWord(word) {
  const lower = word.toLowerCase();
  const allCaps = word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word);
  const ending = (s) => (allCaps ? s.toUpperCase() : s);
  if (PLURAL_IRREGULAR[lower]) {
    const p = PLURAL_IRREGULAR[lower];
    if (allCaps) return p.toUpperCase();
    return word[0] === word[0].toUpperCase() ? p[0].toUpperCase() + p.slice(1) : p;
  }
  if (PLURAL_SAME.has(lower)) return word;
  if (/[aeiou]z$/.test(lower)) return word + ending('zes');
  if (/(ss|us|is|x|z|ch|sh)$/.test(lower)) return word + ending('es');
  if (/s$/.test(lower)) return word;
  if (/[^aeiou]y$/.test(lower)) return word.slice(0, -1) + ending('ies');
  return word + ending('s');
}

export function suggestPlural(unit) {
  const u = (unit || '').trim().replace(/\s+/g, ' ');
  if (!u) return '';
  if (u.length <= 2 || PLURAL_SYMBOLS.has(u.toLowerCase()) || !/[a-z]/i.test(u) || /\d/.test(u)) return '';
  const of = u.match(/^(.*?\S)( of .+)$/i);
  const head = of ? of[1] : u;
  const tail = of ? of[2] : '';
  const words = head.split(' ');
  const last = words[words.length - 1];
  if (words.length > 1 && PLURAL_SYMBOLS.has(words[0].toLowerCase())) return '';
  if (words.length > 1 && /ed$/i.test(last) && last.length > 3) return '';
  words[words.length - 1] = pluralWord(last);
  return words.join(' ') + tail;
}

// A typed or stepped amount kept in range, to 2 decimals.
export function clampAmount(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.min(AMOUNT_MAX, Math.max(0, value)) * 100) / 100;
}
