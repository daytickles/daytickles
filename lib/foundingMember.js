// lib/foundingMember.js
//
// Founding Member checkpoint program — window math, the month-progress
// read, and enrollment lifecycle orchestration (lazy enrollment +
// advancing through checkpoint months). The actual state transitions
// (restart / fail / complete) are locked in server-side, in
// evaluate_founding_member_month (supabase/migrations/0024) -- this
// file only decides *when* to call it and computes the window it
// needs, never writes enrollment/profile state directly.

import { supabase } from './supabase';
import { monthStartDate, monthEndDateExclusive, monthStartISO, monthEndISOExclusive } from './week';

// Matches the Founding Member spec's monthly requirements table
// exactly. `key` matches a field name returned by the
// compute_founding_member_month_progress RPC below.
//
// These 7 thresholds are also hardcoded in evaluate_founding_member_month
// (supabase/migrations/0024) for the authoritative pass/fail lock-in --
// two sources of truth for the same numbers. If the targets ever
// change, both places need updating or JS-displayed progress and the
// actual locked-in result can silently disagree.
export const MONTHLY_REQUIREMENTS = [
  { key: 'shared_to_feed_count', target: 6, label: 'Shared Tickles to Feed' },
  { key: 'photos_shared_count', target: 6, label: 'Photos shared' },
  { key: 'likes_given_count', target: 2, label: 'Likes given' },
  { key: 'favorited_count', target: 4, label: "Fav'ed a Tickle" },
  { key: 'made_me_smile_count', target: 2, label: 'Tickles tagged "Made me smile"' },
  { key: 'paying_forward_count', target: 2, label: 'Tickles tagged "Paying forward"' },
  { key: 'mood_boost_count', target: 2, label: 'Tickles tagged "Mood boost"' },
];

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// The date window for a given checkpoint month, wall-calendar aligned
// (see lib/week.js). Month 1 runs from the exact enrollment date to
// the end of that same calendar month -- deliberately a partial month
// for anyone who doesn't enroll on the 1st; the program's one-time
// restart grace rule exists specifically to absorb that. Months 2-6
// are full calendar months, counting forward from month 1's month.
export function checkpointWindow(attemptStartedAt, monthIndex) {
  const enrolled = parseLocalDate(attemptStartedAt);

  if (monthIndex === 1) {
    return {
      monthIndex,
      startDate: attemptStartedAt,
      endDateExclusive: monthEndDateExclusive(enrolled),
      startISO: enrolled.toISOString(),
      endISOExclusive: monthEndISOExclusive(enrolled),
    };
  }

  const targetMonth = new Date(enrolled.getFullYear(), enrolled.getMonth() + (monthIndex - 1), 1);
  return {
    monthIndex,
    startDate: monthStartDate(targetMonth),
    endDateExclusive: monthEndDateExclusive(targetMonth),
    startISO: monthStartISO(targetMonth),
    endISOExclusive: monthEndISOExclusive(targetMonth),
  };
}

// Reads progress for one user/window via the SECURITY INVOKER RPC
// (supabase/migrations/0023) -- RLS on the underlying tables still
// applies to the *calling* session regardless of userId passed in, so
// this only ever returns real counts when called for one's own id.
export async function fetchMonthProgress(userId, window) {
  const { data, error } = await supabase.rpc('compute_founding_member_month_progress', {
    p_user_id: userId,
    p_start_date: window.startDate,
    p_end_date_exclusive: window.endDateExclusive,
    p_start_utc: window.startISO,
    p_end_utc_exclusive: window.endISOExclusive,
  });
  if (error) throw error;
  return data;
}

export function isMonthPassed(progress) {
  return MONTHLY_REQUIREMENTS.every((r) => (progress?.[r.key] || 0) >= r.target);
}

// Creates the caller's founding_member_enrollment row if it doesn't
// exist yet (existing users, enrolled lazily on first contact with the
// feature -- see supabase/migrations/0024 for why this isn't a bulk
// backfill). A no-op for anyone already enrolled, including everyone
// who signed up after 0024 landed (handle_new_user() enrolls them
// directly).
export async function ensureFoundingMemberEnrollment(userId) {
  const { data, error } = await supabase.rpc('ensure_founding_member_enrollment', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

async function fetchEnrollment(userId) {
  const { data, error } = await supabase
    .from('founding_member_enrollment')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchEvaluatedMonthIndexes(userId, attempt) {
  const { data, error } = await supabase
    .from('founding_member_month_result')
    .select('month_index')
    .eq('user_id', userId)
    .eq('attempt', attempt);
  if (error) throw error;
  return data.map((row) => row.month_index);
}

// Redeems a manually-entered referral code for the *current* user --
// there's no target-user parameter to get wrong here, the server
// function (0026) always acts on auth.uid(). Returns
// { redeemed: true } or { redeemed: false, reason }; reason is one of
// 'invalid_code' | 'self_referral' | 'already_redeemed'. Never throws
// for a bad/typo'd code -- onboarding shouldn't block on this.
export async function redeemFoundingMemberReferralCode(code) {
  const { data, error } = await supabase.rpc('redeem_founding_member_referral_code', {
    p_code: code,
  });
  if (error) throw error;
  return data;
}

// Backfills a referral_code for the current user if they don't have
// one yet (pre-0022 accounts -- see 0028). Idempotent: returns the
// existing code untouched if already set.
export async function ensureFoundingMemberReferralCode(userId) {
  const { data, error } = await supabase.rpc('ensure_founding_member_referral_code', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

// Attempts to lock in the referral queue-jump for the current user --
// a safe, idempotent no-op unless they actually have 2+ referrals and
// don't already hold a slot (see 0025's own re-derivation of
// eligibility; nothing here is trusted client-side).
export async function reserveFoundingMemberSlotForReferral(userId) {
  const { data, error } = await supabase.rpc('reserve_founding_member_slot_for_referral', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

// Locks in pass/fail for every checkpoint month whose window has
// already closed but hasn't been evaluated yet, one month at a time,
// stopping as soon as a month is still in progress or a state
// transition happens (restart / fail / complete). Safe to call
// eagerly and often (e.g. every time the FM page opens) --
// evaluate_founding_member_month is idempotent per (user, attempt,
// month_index), so re-running this after it's already caught up is a
// fast no-op. Also opportunistically attempts the referral queue-jump
// reservation on every call, for the reason explained in 0026: the
// referrer's own client is what has to trigger it, since it can only
// ever act on auth.uid(). Returns the current enrollment row.
export async function advanceFoundingMemberProgress(userId) {
  // Independent of each other -- reserveFoundingMemberSlotForReferral
  // does its own enrollment lookup server-side, and the referral-code
  // backfill touches neither table -- so there's no reason to pay for
  // three round-trips in sequence.
  const [enrollmentResult] = await Promise.all([
    ensureFoundingMemberEnrollment(userId),
    reserveFoundingMemberSlotForReferral(userId),
    ensureFoundingMemberReferralCode(userId),
  ]);
  let enrollment = enrollmentResult;

  while (enrollment.status === 'active') {
    const attempt = enrollment.restart_count + 1;
    const evaluated = await fetchEvaluatedMonthIndexes(userId, attempt);
    const nextMonthIndex = evaluated.length ? Math.max(...evaluated) + 1 : 1;
    if (nextMonthIndex > 6) break;

    const window = checkpointWindow(enrollment.attempt_started_at, nextMonthIndex);
    if (new Date() < new Date(window.endISOExclusive)) break; // window still open

    // start_date/end_date_exclusive are deliberately not sent -- the
    // server recomputes and verifies those itself (see 0024) rather
    // than trusting client-supplied calendar bounds; only the UTC
    // instants are needed here, since local-offset knowledge is the
    // one thing only the client actually has.
    const { data, error } = await supabase.rpc('evaluate_founding_member_month', {
      p_user_id: userId,
      p_attempt: attempt,
      p_month_index: nextMonthIndex,
      p_start_utc: window.startISO,
      p_end_utc_exclusive: window.endISOExclusive,
    });
    if (error) throw error;
    if (!data.evaluated) break;

    enrollment = await fetchEnrollment(userId);
  }

  return enrollment;
}
