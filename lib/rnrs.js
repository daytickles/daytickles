// lib/rnrs.js
//
// Routines and Reminders (RnRs): tiles the user places on Morning,
// Afternoon or Evening of a day, then marks Done or Skip, or moves.
// One kind of tile -- the user decides whether it is a routine or a
// reminder. No notifications, times, repeats or tokens.
//
// Tables: rnr_tiles (the user's own tiles) and rnr_placements (a tile on
// a day, with slot and status), migration 0078. Starter tiles are not
// rows: a placement stores the starter's key, so the wording below can
// change without a migration. NEVER rename or reuse a shipped key.

import { supabase } from './supabase';

export const RNR_SLOTS = ['morning', 'afternoon', 'evening'];

export const RNR_SLOT_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

// slot is only the slot a starter is suggested under in the Add picker;
// any starter can be placed in any slot.
export const STARTER_TILES = [
  { key: 'smile-two', label: 'Smile at 2 people this morning', slot: 'morning' },
  { key: 'good-morning', label: 'Say good morning like you mean it', slot: 'morning' },
  { key: 'stretch-breathe', label: 'Stretch and take 3 slow breaths', slot: 'morning' },
  { key: 'notice-good', label: 'Notice one thing that looks good today', slot: 'morning' },
  { key: 'compliment', label: 'Pay a compliment', slot: 'afternoon' },
  { key: 'step-outside', label: 'Step outside for 5 minutes', slot: 'afternoon' },
  { key: 'thank-small', label: 'Thank someone for something small', slot: 'afternoon' },
  { key: 'well-done', label: "Tell yourself 'well done'", slot: 'afternoon' },
  { key: 'one-smile', label: 'Name one thing that made you smile', slot: 'evening' },
  { key: 'glad-you', label: "Tell someone you're glad they're in your life", slot: 'evening' },
  { key: 'phone-down', label: 'Put the phone down for 10 minutes', slot: 'evening' },
  { key: 'kind-tomorrow', label: 'Do one small kind thing for tomorrow-you', slot: 'evening' },
];

export const RNR_TILE_MAX_LENGTH = 80;

// Shown for a starter key this build doesn't know (e.g. one added in a
// later version, seen on an older install).
const UNKNOWN_STARTER_LABEL = 'A small thing for today';

const STARTER_BY_KEY = Object.fromEntries(STARTER_TILES.map((t) => [t.key, t]));

const PLACEMENT_SELECT =
  'id, plan_date, slot, tile_id, starter_key, status, position, done_at, created_at, rnr_tiles(label)';

// The label a placement shows: its own tile's label (archived or not),
// or the starter's.
export function placementLabel(p) {
  if (p.tile_id) return p.rnr_tiles?.label || UNKNOWN_STARTER_LABEL;
  return STARTER_BY_KEY[p.starter_key]?.label || UNKNOWN_STARTER_LABEL;
}

function withLabel(p) {
  return { ...p, label: placementLabel(p) };
}

// One day's placements (planDate is a local 'YYYY-MM-DD'), each with a
// `label`, in slot then position then created order.
export async function fetchDayPlacements(userId, planDate) {
  const { data, error } = await supabase
    .from('rnr_placements')
    .select(PLACEMENT_SELECT)
    .eq('user_id', userId)
    .eq('plan_date', planDate)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) return { data: null, error };
  return { data: (data || []).map(withLabel), error: null };
}

// Done placements from startDate to endDate (local 'YYYY-MM-DD', both
// included), each with a `label` -- the Calendar's month record. Read
// only. Ordered by plan_date, then slot (Morning, Afternoon, Evening),
// then position and created order. Slot is sorted here, not in the
// query, because the column sorts alphabetically.
export async function fetchDonePlacementsInRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('rnr_placements')
    .select(PLACEMENT_SELECT)
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('plan_date', startDate)
    .lte('plan_date', endDate)
    .order('plan_date', { ascending: true })
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) return { data: null, error };
  const slotIndex = (s) => RNR_SLOTS.indexOf(s);
  const sorted = [...(data || [])].sort((a, b) => {
    if (a.plan_date !== b.plan_date) return a.plan_date < b.plan_date ? -1 : 1;
    return slotIndex(a.slot) - slotIndex(b.slot);
  });
  return { data: sorted.map(withLabel), error: null };
}

// Places a starter (starterKey) or one of the user's own tiles (tileId)
// on a day. Goes to the end of its slot.
export async function addPlacement(userId, { planDate, slot, starterKey = null, tileId = null, position = null }) {
  const { data, error } = await supabase
    .from('rnr_placements')
    .insert({
      user_id: userId,
      plan_date: planDate,
      slot,
      starter_key: tileId ? null : starterKey,
      tile_id: tileId || null,
      position,
    })
    .select(PLACEMENT_SELECT)
    .single();
  if (error) return { data: null, error };
  return { data: withLabel(data), error: null };
}

// status is 'done', 'skipped' or 'planned' (planned = undo).
export async function setPlacementStatus(placementId, status) {
  const { error } = await supabase
    .from('rnr_placements')
    .update({ status, done_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', placementId);
  return { error };
}

// Moves a placement to another slot and/or day. Status stays as it is.
export async function movePlacement(placementId, { slot, planDate, position = null }) {
  const patch = { position };
  if (slot) patch.slot = slot;
  if (planDate) patch.plan_date = planDate;
  const { error } = await supabase.from('rnr_placements').update(patch).eq('id', placementId);
  return { error };
}

// Removes a placement from its day. Not used by the screens yet.
export async function removePlacement(placementId) {
  const { error } = await supabase.from('rnr_placements').delete().eq('id', placementId);
  return { error };
}

// The user's own tiles that aren't archived, oldest first.
export async function fetchMyTiles(userId) {
  const { data, error } = await supabase
    .from('rnr_tiles')
    .select('id, label, created_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  return { data: data || [], error };
}

function cleanLabel(label) {
  return (label || '').trim().replace(/\s+/g, ' ').slice(0, RNR_TILE_MAX_LENGTH);
}

export async function createTile(userId, label) {
  const clean = cleanLabel(label);
  if (!clean) return { data: null, error: new Error('empty') };
  const { data, error } = await supabase
    .from('rnr_tiles')
    .insert({ user_id: userId, label: clean })
    .select('id, label, created_at')
    .single();
  return { data, error };
}

// Renaming changes the label everywhere the tile is placed, past days
// included.
export async function renameTile(tileId, label) {
  const clean = cleanLabel(label);
  if (!clean) return { error: new Error('empty') };
  const { error } = await supabase.from('rnr_tiles').update({ label: clean }).eq('id', tileId);
  return { error };
}

// "Delete" in the app: hides the tile from My tiles. Its placements stay
// (with their label), so past Done counts don't change.
export async function archiveTile(tileId) {
  const { error } = await supabase
    .from('rnr_tiles')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', tileId);
  return { error };
}

// Done placements from weekStartDate (local 'YYYY-MM-DD') onwards.
// Returns the Supabase response ({ count, error }), so it can sit in a
// Promise.all.
export function countDoneSince(userId, weekStartDate) {
  return supabase
    .from('rnr_placements')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('plan_date', weekStartDate);
}
