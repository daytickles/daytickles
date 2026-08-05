// lib/pinBoardNote.js
//
// One-time "photos live only on this device" note for the Pin Board.
// Deliberately AsyncStorage, not a synced profiles column like
// home_guide_seen — the seen-state of a note about local-only data
// should itself stay local, consistent with lib/pinBoardDb.js.
//
// Keyed per-account (suffixed with userId), not just per-device: without
// the suffix, one account dismissing the note on a shared/test device
// would silently hide it from every other account on that same device.
// The permanent caption on the Pin Board screen stays the persistent
// backstop regardless — this only governs the one-time emphatic banner.

import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_KEY_PREFIX = 'daytickles-pinboard-note-seen-';

export async function hasSeenPinBoardNote(userId) {
  const seen = await AsyncStorage.getItem(SEEN_KEY_PREFIX + userId);
  return seen === 'true';
}

export async function markPinBoardNoteSeen(userId) {
  await AsyncStorage.setItem(SEEN_KEY_PREFIX + userId, 'true');
}
