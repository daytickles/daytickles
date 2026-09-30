// lib/freemiumCaps.js
//
// Freemium soft caps -- single source of truth for every capped
// feature's age-tiered numbers, the account-age bucket lookup, and the
// weekly counter bookkeeping (supabase/migrations/0066 feature_usage).
//
// Tier is driven purely by account age (days since trial_started_at)
// in 30-day blocks: days 0-29 = tier 0 (month 1), 30-59 = tier 1,
// 60-89 = tier 2, 90+ = tier 3 (the floor). Same 30-day-block
// definition the old share cap used, just four buckets instead of
// three. Any active paid plan gets tier 0's value for every feature.
//
// Weekly caps reset on the user's own calendar week (local,
// profiles.week_start_day -- see lib/week.js), not on a rolling window.

import { supabase } from './supabase';
import { ACCENT_THEMES, MAX_GOALS } from './theme';
import { showAlert } from './themedAlert';
import { currentWeekStartDate, DEFAULT_WEEK_START_DAY } from './week';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIER_DAYS = 30;

// [month 1, month 2, month 3, month 4+ floor]
const WEEKLY_CAPS = {
  likesGiven:            [Infinity, 30, 20, 10],
  polaroidExternalShare: [Infinity, 10, 7, 5],
  highFivesGiven:        [Infinity, 20, 10, 3],
  ripplePhotoTickle:     [Infinity, 10, 5, 3],
  rippleAttachedPhoto:   [Infinity, 10, 5, 3],
  rippleTextTickle:      [Infinity, 20, 10, 5],
};

// Ceilings on how many you currently have -- no period, no reset.
// activeGoals' month 1 is the existing MAX_GOALS (still enforced
// server-side too, see enforce_goal_cap in 0013), accentColors' is
// every theme there is; 5 -> 4 -> 2 -> 1 skipping 3 is intentional.
const CONCURRENT_CAPS = {
  following:    [Infinity, 15, 10, 5],
  activeGoals:  [MAX_GOALS, 4, 2, 1],
  accentColors: [ACCENT_THEMES.length, 5, 5, 2],
};

// Which themes stay selectable once accentColors' cap drops below the
// full set -- rust first since it's the DB default + accentFor fallback.
const ACCENT_FLOOR_THEME_IDS = ['rust', 'sage'];

// Plural noun used in the weekly block message -- "limit of 20 likes".
const WEEKLY_NOUNS = {
  likesGiven: 'likes',
  polaroidExternalShare: 'Polaroid shares',
  highFivesGiven: 'High Fives',
  ripplePhotoTickle: 'photo-only Ripples',
  rippleAttachedPhoto: 'Ripples with a photo',
  rippleTextTickle: 'text-only Ripples',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isActivePaidPlan(profile, now = new Date()) {
  if (!profile || profile.subscription_plan === 'none') return false;
  if (!profile.subscription_expires_at) return true; // lifetime, or no expiry set
  return new Date(profile.subscription_expires_at) > now;
}

function tierIndex(profile, now) {
  if (isActivePaidPlan(profile, now)) return 0;
  const daysOld = Math.floor((now - new Date(profile.trial_started_at)) / DAY_MS);
  return Math.min(3, Math.max(0, Math.floor(daysOld / TIER_DAYS)));
}

// Current cap for any feature in either table above.
export function capFor(profile, feature, now = new Date()) {
  const tiers = WEEKLY_CAPS[feature] || CONCURRENT_CAPS[feature];
  return tiers[tierIndex(profile, now)];
}

// Accent theme ids currently selectable (the user's own current theme
// always stays applied even if it isn't in here -- grandfathered).
export function allowedAccentThemeIds(profile, now = new Date()) {
  const cap = capFor(profile, 'accentColors', now);
  if (cap >= ACCENT_THEMES.length) return ACCENT_THEMES.map((t) => t.id);
  return ACCENT_FLOOR_THEME_IDS.slice(0, cap);
}

// { feature, cap, count, remaining, unlimited, periodStart } for a
// weekly feature. A stored row from an earlier week reads as count 0.
export async function weeklyCapStatus(profile, feature, now = new Date()) {
  const cap = capFor(profile, feature, now);
  const periodStart = currentWeekStartDate(profile.week_start_day ?? DEFAULT_WEEK_START_DAY);
  if (cap === Infinity) {
    return { feature, cap, count: 0, remaining: Infinity, unlimited: true, periodStart };
  }

  const { data, error } = await supabase
    .from('feature_usage')
    .select('period_start, count')
    .eq('user_id', profile.id)
    .eq('feature', feature)
    .maybeSingle();
  if (error) throw error;

  const count = data && data.period_start === periodStart ? data.count : 0;
  return { feature, cap, count, remaining: Math.max(0, cap - count), unlimited: false, periodStart };
}

// Check-before-allow for a weekly feature. Returns { blocked: true,
// feature, cap } if this week's cap is already reached (nothing
// recorded -- caller should stop and show alertCapBlocked), otherwise
// records one use and returns { blocked: false }. Unlimited tiers
// record nothing, same as the old share cap never counted paid plans.
// Consumed before the caller's own action, like the old share cap --
// an action that then fails still costs its one use.
export async function checkAndConsumeWeeklyCap(profile, feature, now = new Date()) {
  const status = await weeklyCapStatus(profile, feature, now);
  if (status.unlimited) return { blocked: false };
  if (status.count >= status.cap) return { blocked: true, feature, cap: status.cap };

  const { error } = await supabase
    .from('feature_usage')
    .upsert({
      user_id: profile.id,
      feature,
      period_start: status.periodStart,
      count: status.count + 1,
    });
  if (error) throw error;

  return { blocked: false };
}

// Which Ripple bucket a private -> public flip draws from. Mirrors each
// screen's handleToggleVisibility branches: photo-only uploads its
// photo, a text entry with a resolvable linked photo uploads that
// photo too, anything else goes up as text only. Returns null for a
// photo-only entry with no local photo -- that flip is refused by the
// screen's own "Can't make this public yet" guard before anything is
// posted, so it shouldn't cost a use.
export function rippleFeatureFor(entry, photoUri) {
  if (entry.entry_kind === 'photo_only') return photoUri ? 'ripplePhotoTickle' : null;
  if (photoUri) return 'rippleAttachedPhoto';
  return 'rippleTextTickle';
}

// Block copy for any capped feature, as { title, message }. Weekly
// features name the day they reset on (profile.week_start_day);
// concurrent ones don't reset, so their copy just states the current
// ceiling. Shared by alertCapBlocked below and ShareModal's own
// in-modal blocked state, so the wording never drifts between them.
export function capBlockedMessage({ feature, cap }, profile) {
  const title = 'Limit reached';
  if (feature === 'following') {
    return { title, message: `You can follow up to ${cap} people right now.` };
  }
  if (feature === 'accentColors') {
    const names = allowedAccentThemeIds(profile)
      .map((id) => ACCENT_THEMES.find((t) => t.id === id).name)
      .join(' and ');
    return { title, message: `You can choose from ${cap} accent colors right now: ${names}.` };
  }
  const resetDay = DAY_NAMES[profile?.week_start_day ?? DEFAULT_WEEK_START_DAY];
  return {
    title,
    message: `You've reached this week's limit of ${cap} ${WEEKLY_NOUNS[feature]}. It resets on ${resetDay}.`,
  };
}

// Single-OK themed alert for a { blocked: true, feature, cap } result.
export function alertCapBlocked(block, profile) {
  const { title, message } = capBlockedMessage(block, profile);
  showAlert(title, message);
}
