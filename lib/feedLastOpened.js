// lib/feedLastOpened.js
//
// Per-tab "last opened" timestamps for Tickle Stash's Following/Rippled
// tabs, backing the "new since you were here" badges/divider. Deliberately
// AsyncStorage, not a synced profiles column, for reasons stronger than
// the usual local-vs-synced tradeoff (see lib/pinBoardNote.js for that
// usual case): project memory `tickle-nature-toggle-bug` has a proven,
// still-unresolved finding that a bare setProfile() call on AuthContext is
// by itself sufficient to trigger a delayed bounce-to-Home navigation.
// Every prior profile column this app has ever added is written rarely
// (a one-time flip, an occasional settings toggle); this value is
// designed to be rewritten on every single tab open, which would make it
// by far the highest-frequency trigger of that unresolved bug. Local
// storage sidesteps the whole class of risk.
//
// Keyed per-account (suffixed with userId), same reasoning as
// pinBoardNote.js -- without the suffix, one account opening the tab on a
// shared/test device would silently reset the count for every other
// account on that device.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'daytickles-feed-last-opened-';

function storageKey(tabId, userId) {
  return `${KEY_PREFIX}${tabId}-${userId}`;
}

// Returns the stored timestamp (ms since epoch) or null if this tab has
// never been opened on this device -- callers should treat null as "no
// badge/divider" (no baseline to count new posts against), not as 0.
export async function getLastOpened(tabId, userId) {
  const raw = await AsyncStorage.getItem(storageKey(tabId, userId));
  return raw ? Number(raw) : null;
}

export async function setLastOpened(tabId, userId, timestampMs) {
  await AsyncStorage.setItem(storageKey(tabId, userId), String(timestampMs));
}
