// lib/pinBoardNote.js
//
// One-time "photos live only on this device" note for the Pin Board.
// Deliberately AsyncStorage, not a synced profiles column like
// home_guide_seen — the seen-state of a note about local-only data
// should itself stay local, consistent with lib/pinBoardDb.js.

import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_KEY = 'daytickles-pinboard-note-seen';

export async function hasSeenPinBoardNote() {
  const seen = await AsyncStorage.getItem(SEEN_KEY);
  return seen === 'true';
}

export async function markPinBoardNoteSeen() {
  await AsyncStorage.setItem(SEEN_KEY, 'true');
}
