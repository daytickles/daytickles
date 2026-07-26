// lib/rateUs.js
//
// Thin wrapper around expo-store-review's two native primitives for an
// eventual "Rate us" prompt — no product logic here yet (when to ask,
// how often, dismissal cooldown, etc.), since that was never designed.
//
// Imported by settings.js (handleRateUs) — confirmed working on the
// dev-client build tested today. Like expo-notifications (see
// lib/reminders.js), the native module isn't available in Expo Go, so
// this requires a custom dev client rather than Expo Go.

import * as StoreReview from 'expo-store-review';

export async function isReviewAvailable() {
  return StoreReview.isAvailableAsync();
}

export async function requestReview() {
  return StoreReview.requestReview();
}
