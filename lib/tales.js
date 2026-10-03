// lib/tales.js
//
// TickleTales (migration 0067) -- a named public thread of Rippled
// Tickles. A chapter is just a tickle_entries row with tale_id set.
// Chapter numbers are never stored: a chapter's number is its rank among
// the Tale's currently-public entries, ordered by entry_date (created_at
// as tiebreak), so an older entry tagged in later lands in its narrative
// place and numbers close up on their own when a chapter is deleted or
// stays Un-Rippled.

import { supabase } from './supabase';

export const TALE_TITLE_MAX = 60;
export const TALE_BLURB_MAX = 200;

// Icon choices for a new Multickle (tales.icon, migration 0069), in
// picker order. book-outline is the column default and the fallback.
export const DEFAULT_TALE_ICON = 'book-outline';
export const TALE_ICONS = [
  { name: 'airplane-outline', label: 'Travel' },
  { name: 'restaurant-outline', label: 'Food' },
  { name: 'paw-outline', label: 'Pets' },
  { name: 'people-outline', label: 'People' },
  { name: 'gift-outline', label: 'Celebration' },
  { name: 'fitness-outline', label: 'Fitness' },
  { name: 'home-outline', label: 'Home' },
  { name: 'heart-outline', label: 'Love' },
  { name: DEFAULT_TALE_ICON, label: 'General' },
];
const TALE_ICON_NAMES = new Set(TALE_ICONS.map((i) => i.name));

// Ionicons name to render for a stored tales.icon -- anything missing
// or unrecognised falls back to the default rather than a blank glyph.
export function taleIconName(icon) {
  return TALE_ICON_NAMES.has(icon) ? icon : DEFAULT_TALE_ICON;
}

// Chronological, oldest first -- the one ordering every chapter list and
// every chapter number in the app derives from.
export function compareChapters(a, b) {
  if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

// The signed-in user's own Tales, Ongoing first then Completed, each
// newest first (same stable completed-last sort as fetchFollowedTales
// below). Feeds the "Add to a Tale…" picker and Manage Tales.
export async function fetchMyTales(userId) {
  const { data, error } = await supabase
    .from('tales')
    .select('id, title, blurb, icon, completed_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return [...data].sort((a, b) => (a.completed_at ? 1 : 0) - (b.completed_at ? 1 : 0));
}

// Multickles the signed-in user follows (tale_follows), as { id, title,
// icon, completed }. Feeds the Stash Following tab's Multickle pills.
// Newest follow first, then Completed ones moved to the end -- the same
// stable completed-last sort as fetchMyTales and the Goal chips
// (dc295dd), so each group keeps the query's newest-first order. A
// follow whose tale row is gone is skipped.
export async function fetchFollowedTales(userId) {
  const { data, error } = await supabase
    .from('tale_follows')
    .select('created_at, tales(id, title, icon, completed_at)')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data
    .filter((row) => row.tales)
    .map(({ tales: t }) => ({
      id: t.id,
      title: t.title,
      icon: taleIconName(t.icon),
      completed: !!t.completed_at,
    }))
    .sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0));
}

// Map<entryId, { taleId, title, icon, completed, chapterNumber }> for every
// loaded entry that has a tale_id. chapterNumber is null for an entry
// that's tagged but currently private -- only its owner can ever see
// that row (RLS), and it isn't a numbered chapter until it's Rippled
// again. Two small queries regardless of how many entries are on screen,
// and none at all when nothing loaded is tagged.
export async function fetchTaleBadges(entries) {
  const taleIds = [...new Set(entries.map((e) => e.tale_id).filter(Boolean))];
  if (taleIds.length === 0) return new Map();

  const [talesRes, chaptersRes] = await Promise.all([
    supabase.from('tales').select('id, title, icon, completed_at').in('id', taleIds),
    supabase
      .from('tickle_entries')
      .select('id, tale_id, entry_date, created_at')
      .in('tale_id', taleIds)
      .eq('visibility', 'public'),
  ]);
  if (talesRes.error || chaptersRes.error) return new Map();

  const talesById = Object.fromEntries(talesRes.data.map((t) => [t.id, t]));
  const chapterNumberById = new Map();
  const byTale = new Map();
  for (const row of chaptersRes.data) {
    if (!byTale.has(row.tale_id)) byTale.set(row.tale_id, []);
    byTale.get(row.tale_id).push(row);
  }
  for (const rows of byTale.values()) {
    rows.sort(compareChapters).forEach((row, i) => chapterNumberById.set(row.id, i + 1));
  }

  const map = new Map();
  for (const entry of entries) {
    const tale = entry.tale_id && talesById[entry.tale_id];
    if (!tale) continue;
    map.set(entry.id, {
      taleId: tale.id,
      title: tale.title,
      icon: taleIconName(tale.icon),
      completed: !!tale.completed_at,
      chapterNumber: chapterNumberById.get(entry.id) ?? null,
    });
  }
  return map;
}

// Same shape as lib/goalTagging.js's assignEntryGoal -- optimistic,
// rolled back on error. Unlike goal tagging, the server can genuinely
// refuse this one (enforce_tale_chapter_rules: not your Tale, entry not
// public, Tale completed), so the error is returned for the caller to
// surface instead of being swallowed.
export async function assignEntryTale({ entryId, taleId, currentTaleId, setEntries }) {
  if (taleId === currentTaleId) return { error: null };

  let previous;
  setEntries((prev) => {
    previous = prev;
    return prev.map((e) => (e.id === entryId ? { ...e, tale_id: taleId } : e));
  });

  const { error } = await supabase
    .from('tickle_entries')
    .update({ tale_id: taleId })
    .eq('id', entryId);

  if (error) setEntries(previous);
  return { error };
}
