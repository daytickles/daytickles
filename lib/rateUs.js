// lib/rateUs.js
//
// Thin wrapper around expo-store-review's two native primitives for an
// eventual "Rate us" prompt — no product logic here yet (when to ask,
// how often, dismissal cooldown, etc.), since that was never designed.
//
// NOT currently imported anywhere — confirmed via a real Expo Go device
// test: calling StoreReview.isAvailableAsync() throws "Cannot find
// native module 'ExpoStoreReview'". Same class of dead end as
// expo-notifications (see lib/reminders.js) — the native module isn't
// available in Expo Go on this platform. Left in place, dependency
// included in package.json, for whenever a custom EAS development
// build exists to test against.

import * as StoreReview from 'expo-store-review';

export async function isReviewAvailable() {
  return StoreReview.isAvailableAsync();
}

export async function requestReview() {
  return StoreReview.requestReview();
}
