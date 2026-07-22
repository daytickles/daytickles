// lib/sharing.js
//
// Native one-to-one sharing + the declining monthly soft cap from
// daytickles-spec.md's Monetization section: 20 shares in the first 30
// days from signup, 15 in the next 30, 10 from then on (the floor) —
// unlimited on any active paid plan. Tracked via profiles.share_period_start
// + profiles.share_count_this_period, resetting every 30 days.

import { Share } from 'react-native';
import { supabase } from './supabase';

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

// Records the share (period bookkeeping + a tickle_shares row) and opens
// the native share sheet. Returns { blocked: true, cap } instead of
// sharing if the soft cap has already been reached — callers should show
// a message rather than sharing anyway.
export async function shareEntry({ profile, entry, captionId, onProfileUpdated }) {
  const now = new Date();
  const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);
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

  await supabase.from('tickle_shares').insert({
    entry_id: entry.id,
    created_by: profile.id,
    caption: captionId,
  });

  await Share.share({
    message: `${caption.label}\n\n${entry.text_content}`,
  });

  return { blocked: false };
}
