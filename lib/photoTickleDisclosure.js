// lib/photoTickleDisclosure.js
//
// One-time "photo Tickles auto-save to your gallery" disclosure gate.
// Same shape as lib/pinBoardNote.js: AsyncStorage (not a synced profiles
// column), keyed per-account so one account dismissing it on a shared
// device doesn't silently hide it from another account on that device.

import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_KEY_PREFIX = 'daytickles-photo-tickle-disclosure-seen-';

export async function hasSeenPhotoTickleDisclosure(userId) {
  const seen = await AsyncStorage.getItem(SEEN_KEY_PREFIX + userId);
  return seen === 'true';
}

export async function markPhotoTickleDisclosureSeen(userId) {
  await AsyncStorage.setItem(SEEN_KEY_PREFIX + userId, 'true');
}
