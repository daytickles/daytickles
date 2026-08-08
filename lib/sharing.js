// lib/sharing.js
//
// Native one-to-one sharing + the declining monthly soft cap from
// daytickles-spec.md's Monetization section: 20 shares in the first 30
// days from signup, 15 in the next 30, 10 from then on (the floor) —
// unlimited on any active paid plan. Tracked via profiles.share_period_start
// + profiles.share_count_this_period, resetting every 30 days.

import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';
import { recordPhotoShare } from './pinBoardDb';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 30;

export const SHARE_CAPTIONS = [
  { id: 'made_me_smile', label: 'This made me smile today' },
  { id: 'thought_of_you', label: 'I saw this and thought of you' },
];

function isActivePaidPlan(profile, now) {
  if (!profile || profile.subscription_plan === 'none') return false;
  if (!profile.subscription_expires_at) return true; // lifetime, or no expiry set
  return new Date(profile.subscription_expires_at) > now;
}

// Cap tier is driven by account age (days since trial_started_at), not by
// how many times the tracking period has rolled over.
function capForAccountAge(trialStartedAt, now) {
  const daysOld = Math.floor((now - new Date(trialStartedAt)) / DAY_MS);
  const periodIndex = Math.floor(daysOld / PERIOD_DAYS);
  if (periodIndex <= 0) return 20;
  if (periodIndex === 1) return 15;
  return 10;
}

// Rolls share_period_start forward (resetting the count to 0) for every
// full 30-day period that's elapsed since it was last touched.
function currentPeriod(profile, now) {
  let periodStart = new Date(`${profile.share_period_start}T00:00:00Z`);
  let count = profile.share_count_this_period;

  while (now - periodStart >= PERIOD_DAYS * DAY_MS) {
    periodStart = new Date(periodStart.getTime() + PERIOD_DAYS * DAY_MS);
    count = 0;
  }

  return { periodStart, count };
}

export function shareStatus(profile, now = new Date()) {
  if (isActivePaidPlan(profile, now)) {
    return { unlimited: true, cap: null, count: 0, remaining: Infinity };
  }
  const cap = capForAccountAge(profile.trial_started_at, now);
  const { count } = currentPeriod(profile, now);
  return { unlimited: false, cap, count, remaining: Math.max(0, cap - count) };
}

// Shared by shareEntry and sharePhoto below — the cap check + bookkeeping
// only ever touches `profiles`, never anything about what's actually
// being shared, so both entry-based and photo-only shares draw down the
// exact same monthly allowance through this one gate. Returns
// { blocked: true, cap } if the cap's already reached (nothing recorded,
// caller should stop) or { blocked: false } (allowance consumed if not
// unlimited; caller proceeds with its own specific bookkeeping + the
// actual share).
async function checkAndConsumeShareCap(profile, now, onProfileUpdated) {
  const status = shareStatus(profile, now);

  if (!status.unlimited && status.count >= status.cap) {
    return { blocked: true, cap: status.cap };
  }

  if (!status.unlimited) {
    const { periodStart, count } = currentPeriod(profile, now);
    const { error } = await supabase
      .from('profiles')
      .update({
        share_period_start: periodStart.toISOString().slice(0, 10),
        share_count_this_period: count + 1,
      })
      .eq('id', profile.id);
    if (error) throw error;
    if (onProfileUpdated) await onProfileUpdated();
  }

  return { blocked: false };
}

// Records the share (period bookkeeping + a tickle_shares row) and opens
// the native share sheet. Returns { blocked: true, cap } instead of
// sharing if the soft cap has already been reached — callers should show
// a message rather than sharing anyway.
//
// cardImageUri is an optional pre-generated share-card image (see
// lib/useShareCard.js) for entries with a linked Pin Board photo — when
// present it goes out via expo-sharing (file-only, no message param),
// otherwise this falls back to RN's Share with the caption + entry text
// exactly as before. The caller decides which applies; this function
// only dispatches on what it's given.
export async function shareEntry({ profile, entry, captionId, onProfileUpdated, cardImageUri }) {
  const now = new Date();
  const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);

  const capResult = await checkAndConsumeShareCap(profile, now, onProfileUpdated);
  if (capResult.blocked) return capResult;

  await supabase.from('tickle_shares').insert({
    entry_id: entry.id,
    created_by: profile.id,
    caption: captionId,
  });

  if (cardImageUri) {
    await Sharing.shareAsync(cardImageUri, { mimeType: 'image/jpeg', dialogTitle: caption.label });
  } else {
    await Share.share({
      message: `${caption.label}\n\n${entry.text_content}\n\n— via the DayTickles app`,
    });
  }

  return { blocked: false };
}

// Photo-only share — triggered directly from a Pin Board photo (see
// PolaroidCard's Share button), with no tickle_entries row involved at
// all. Same cap gate + profiles bookkeeping as shareEntry (same
// underlying resource, just a different entry point), but deliberately
// skips the tickle_shares insert: that table exists to drive the
// unlisted preview link (daytickles.app/t/<token>), which renders an
// entry's text/mood — there's no entry here to preview, and the photo
// file itself lives only in this device's local SQLite storage (see
// lib/pinBoardDb.js), never synced to Supabase, so there's nothing
// cloud-side a share row could even reference. The share event itself
// (which caption, when) is still recorded, just locally alongside the
// photo it belongs to — see recordPhotoShare in lib/pinBoardDb.js — so
// Weekly Summary's "thought of you" count doesn't silently miss
// photo-only shares the way it would if nothing were recorded at all.
//
// photoId + cardImageUri are both required, not optional — unlike
// shareEntry there's no text-message fallback available here (no entry
// text exists to fall back to), so the caller is expected to have
// already generated cardImageUri (or to not call this at all if
// generation failed).
export async function sharePhoto({ profile, photoId, captionId, onProfileUpdated, cardImageUri }) {
  const now = new Date();
  const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);

  const capResult = await checkAndConsumeShareCap(profile, now, onProfileUpdated);
  if (capResult.blocked) return capResult;

  await recordPhotoShare(profile.id, photoId, captionId);

  await Sharing.shareAsync(cardImageUri, { mimeType: 'image/jpeg', dialogTitle: caption.label });

  return { blocked: false };
}
