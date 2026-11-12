// lib/quickQuests.js
//
// Quick Quest data and helpers. A Quick Quest is a tiny prompt (a kind
// and a time) the user can do and save. Saving inserts one quick_quests
// row (supabase/migrations/0082_quick_quests.sql); the database trigger
// award_token_on_quick_quest adds the token, so there is no token code
// here. The prompt texts live only in this file -- the row stores just
// the prompt's key, never its text or a note.
//
// The "seen" list (so prompts don't repeat until all have been shown) and
// the "Use this every time" choice live in AsyncStorage, per phone, keyed
// by user id like lib/feedLastOpened.js. Every read and write is
// best-effort: a storage failure falls back quietly and never throws.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// vibe is the suggested tickle_nature for "Keep as a Tickle": the keys of
// NATURE_LABELS in lib/theme.js (received = Made me smile, given = Paying
// forward, self = For me).
export const QUEST_KINDS = [
  { key: 'notice', label: 'Notice', hint: 'Look and listen around you.', vibe: 'received' },
  { key: 'explore', label: 'Explore', hint: 'Poke about somewhere new.', vibe: 'self' },
  { key: 'connect', label: 'Connect', hint: 'Think of someone, or reach out.', vibe: 'given' },
  { key: 'create', label: 'Create', hint: 'Make a tiny thing.', vibe: 'self' },
  { key: 'play', label: 'Play', hint: 'Be a little silly.', vibe: 'received' },
];

// Time choices in minutes; QUEST_TIME_ANY (0) means "Any".
export const QUEST_TIMES = [1, 2, 3, 5];
export const QUEST_TIME_ANY = 0;

function prompts(kind, list) {
  return list.map(([text, minutes], i) => ({ key: `${kind}-${i + 1}`, kind, minutes, text }));
}

export const QUEST_PROMPTS = [
  ...prompts('notice', [
    ['Find three things the same shade of blue.', 2],
    ['Find something that looks like a face.', 1],
    ['Notice three different sounds you can hear right now.', 1],
    ['Find the oldest-looking thing near you.', 2],
    ["Notice three textures within arm's reach.", 2],
    ["Look out of a window and find something that's moving.", 1],
    ['Spot something small that someone clearly made with care.', 3],
    ["Pick one spot and notice five small details you'd normally miss.", 5],
  ]),
  ...prompts('explore', [
    ['Open a drawer or shelf you rarely use and find one thing that surprises you.', 3],
    ["Go to a part of your home or street you don't usually look at.", 3],
    ['Pick an object near you and guess how it was made.', 2],
    ['Find something you could use for a different job than the one it was made for.', 3],
    ["Look up a word you've never used and find out what it means.", 3],
    ['Open a book anywhere and read the first sentence you see.', 2],
    ["Find the furthest thing you can see and wonder what's there.", 1],
    ["Tidy one small spot and see what you'd forgotten about.", 5],
  ]),
  ...prompts('connect', [
    ['Send someone a message saying why they came to mind.', 2],
    ['Think of someone who made you smile this month.', 1],
    ['Thank someone for something small.', 3],
    ['Remember a kind thing someone did for you, and how it felt.', 2],
    ["Send a photo or a memory to someone who'd enjoy it.", 3],
    ['Smile at, or say hello to, someone near you.', 1],
    ['Remember a laugh you shared with someone.', 2],
    ["Write a proper message to someone you haven't spoken to for a while.", 5],
  ]),
  ...prompts('create', [
    ['Describe your day so far in exactly six words.', 2],
    ['Write a one-line poem about the thing nearest to you.', 3],
    ['Doodle something you can see without looking at the paper.', 3],
    ['Make up a name for a colour you can see.', 1],
    ['Write a two-sentence story about an object near you.', 3],
    ["Take a photo of something ordinary from an angle you'd never normally use.", 3],
    ['Hum a few notes you make up: a tune for today.', 1],
    ['Draw or write about the best part of your day so far.', 5],
  ]),
  ...prompts('play', [
    ['Remember something funny that happened this week.', 2],
    ['Pull a funny face, once.', 1],
    ['Give the nearest object a name and a job title.', 2],
    ['Balance a pen on one finger for as long as you can.', 1],
    ['Think of the silliest thing you could do with a spoon.', 1],
    ['Tell yourself a joke, even a bad one.', 1],
    ['Give the nearest object a voice and let it say one thing.', 2],
    ['Put on one song and move however you like until it ends.', 5],
  ]),
];

export const NOTICE_THREE = [
  'Three things you would normally walk past.',
  'Three things that are round.',
  'Three things that are softer than they look.',
  'Three things someone chose on purpose.',
  'Three things that are older than you.',
  'Three small things that are quietly working (a light, a hinge, a clock).',
].map((text, i) => ({ key: `three-${i + 1}`, minutes: 2, text }));

const KIND_KEYS = QUEST_KINDS.map((k) => k.key);
const VALID_MAX_MINUTES = [QUEST_TIME_ANY, ...QUEST_TIMES];

// True when a prompt matches the kind ('any' or '' = every kind) and the time (0 = any, else minutes <= maxMinutes).
export function promptFits(prompt, kindKey, maxMinutes) {
  const kindOk = !kindKey || kindKey === 'any' || prompt.kind === kindKey;
  const timeOk = !maxMinutes || prompt.minutes <= maxMinutes;
  return kindOk && timeOk;
}

// Random pick from the fitting, not-yet-seen items; once all are seen, starts over without the one just shown.
function pickFrom(list, fits, seen, rand) {
  const seenList = Array.isArray(seen) ? seen : [];
  const fitting = list.filter(fits);
  if (fitting.length === 0) return { prompt: null, seen: seenList };

  const seenSet = new Set(seenList);
  let pool = fitting.filter((p) => !seenSet.has(p.key));
  let base = seenList;
  if (pool.length === 0) {
    // Every fitting one has been shown: forget only those, and skip the
    // last one shown so the same prompt never comes twice in a row.
    const fitKeys = new Set(fitting.map((p) => p.key));
    base = seenList.filter((key) => !fitKeys.has(key));
    const justShown = seenList[seenList.length - 1];
    pool = fitting.length > 1 ? fitting.filter((p) => p.key !== justShown) : fitting;
  }

  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
  const prompt = pool[index];
  return { prompt, seen: [...base, prompt.key] };
}

// Picks a Quick Quest prompt for a kind and time; returns { prompt, seen } with prompt null when nothing fits.
export function pickQuest({ kind = 'any', maxMinutes = QUEST_TIME_ANY, seen = [], rand = Math.random } = {}) {
  return pickFrom(QUEST_PROMPTS, (p) => promptFits(p, kind, maxMinutes), seen, rand);
}

// Picks a "notice three" prompt the same way; returns { prompt, seen }.
export function pickNoticeThree({ seen = [], rand = Math.random } = {}) {
  return pickFrom(NOTICE_THREE, () => true, seen, rand);
}

// Suggested tickle_nature for a kind: the kind's vibe, 'received' for notice_three (as Notice), null if unknown.
export function defaultVibeFor(kindKey) {
  if (kindKey === 'notice_three') return 'received';
  return QUEST_KINDS.find((k) => k.key === kindKey)?.vibe ?? null;
}

// "1 minute" or "N minutes".
export function minutesLabel(m) {
  return m === 1 ? '1 minute' : `${m} minutes`;
}

// A kind's label ("Notice"), or null for a key that isn't one of the five kinds.
export function kindLabel(key) {
  return QUEST_KINDS.find((k) => k.key === key)?.label ?? null;
}

// ---------------------------------------------------------------------
// Storage (AsyncStorage, per user). Never throws.
// ---------------------------------------------------------------------

const SEEN_KEY_PREFIX = 'daytickles-quick-quest-seen:';
const EVERY_TIME_KEY_PREFIX = 'daytickles-quick-quest-every-time:';

// The prompt keys already shown on this phone, or [] when none or unreadable.
export async function loadSeen(userId) {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY_PREFIX + userId);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((key) => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

// Stores the seen prompt keys; a failure is ignored.
export async function saveSeen(userId, keys) {
  try {
    await AsyncStorage.setItem(SEEN_KEY_PREFIX + userId, JSON.stringify(Array.isArray(keys) ? keys : []));
  } catch {
    // Best-effort only.
  }
}

// The saved "Use this every time" choice as { kind, maxMinutes }, or null when none or not valid.
export async function loadEveryTime(userId) {
  try {
    const raw = await AsyncStorage.getItem(EVERY_TIME_KEY_PREFIX + userId);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const { kind, maxMinutes } = value;
    if (kind !== 'any' && !KIND_KEYS.includes(kind)) return null;
    if (!VALID_MAX_MINUTES.includes(maxMinutes)) return null;
    return { kind, maxMinutes };
  } catch {
    return null;
  }
}

// Stores the "Use this every time" choice; a failure is ignored.
export async function saveEveryTime(userId, { kind, maxMinutes }) {
  try {
    await AsyncStorage.setItem(EVERY_TIME_KEY_PREFIX + userId, JSON.stringify({ kind, maxMinutes }));
  } catch {
    // Best-effort only.
  }
}

// Removes the "Use this every time" choice; a failure is ignored.
export async function clearEveryTime(userId) {
  try {
    await AsyncStorage.removeItem(EVERY_TIME_KEY_PREFIX + userId);
  } catch {
    // Best-effort only.
  }
}

// Removes this user's seen list and "Use this every time" choice from the
// phone (called on sign-out and Delete Account); a failure is ignored.
export async function clearQuickQuestLocal(userId) {
  try {
    await AsyncStorage.multiRemove([SEEN_KEY_PREFIX + userId, EVERY_TIME_KEY_PREFIX + userId]);
  } catch {
    // Best-effort only.
  }
}

// ---------------------------------------------------------------------
// Database. Both return { data, error } and never throw.
// ---------------------------------------------------------------------

// Saves one Quick Quest (the trigger adds its token). kind is one of the
// five kinds or 'notice_three'; minutes and promptKey are null when
// unknown. data is { id } of the new row.
export async function saveQuickQuest(userId, { kind, minutes = null, promptKey = null }) {
  try {
    return await supabase
      .from('quick_quests')
      .insert({
        user_id: userId,
        kind,
        minutes: minutes ?? null,
        prompt_key: promptKey ?? null,
      })
      .select('id')
      .single();
  } catch (error) {
    return { data: null, error };
  }
}

// Links a saved Quick Quest to the Tickle it was kept as.
export async function linkQuestToEntry(questId, entryId) {
  try {
    return await supabase
      .from('quick_quests')
      .update({ kept_entry_id: entryId })
      .eq('id', questId);
  } catch (error) {
    return { data: null, error };
  }
}
