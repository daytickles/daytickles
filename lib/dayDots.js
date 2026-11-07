// lib/dayDots.js
//
// Day Dots reads and writes, shared by Home's Day Dots card
// (components/HomeDayDotsCard.js via app/(tabs)/home.js). The two writes
// are the ones that used to live in app/(tabs)/feed.js's My Day picker,
// moved here unchanged when that picker came off My Day:
//   saveDayDot -- upsert on the one-row-per-day key (user_id,prompt_date),
//                 so a change (or a dot after a skip) updates today's row.
//                 Needs day_dots' update policy.
//   skipDayDot -- an insert, so it only works while today has no row yet
//                 (the caller only offers it then).
// Dates are LOCAL dates ('YYYY-MM-DD' from lib/week.js's
// localDateString), never UTC. Day Dots is deliberately not a Tickle
// (see supabase/migrations/0060_day_dots.sql).
import { supabase } from './supabase';
import { localDateString } from './week';

// The 4 sizes, smallest first: dot_index 0..3.
export const DAY_DOT_COUNT = 4;
// The days the card's trail shows: today and the 4 before it.
export const DAY_DOTS_TRAIL_DAYS = 5;

// Map<'YYYY-MM-DD', { status, dot_index }> for today and the
// DAY_DOTS_TRAIL_DAYS - 1 local days before it, or null when the read
// failed. A day with no row simply has no key.
export async function fetchRecentDayDots(userId) {
  const from = localDateString(DAY_DOTS_TRAIL_DAYS - 1);
  const to = localDateString(0);
  const { data, error } = await supabase
    .from('day_dots')
    .select('prompt_date, status, dot_index')
    .eq('user_id', userId)
    .gte('prompt_date', from)
    .lte('prompt_date', to);
  if (error) return null;
  return new Map((data || []).map((r) => [r.prompt_date, { status: r.status, dot_index: r.dot_index }]));
}

// Today's phase from one day's row (or none) -- the same three states the
// old My Day picker used: 'open' (no row), 'answered' (with dotIndex) or
// 'skipped'.
export function dayDotPhase(row) {
  if (!row) return { phase: 'open' };
  return row.status === 'answered' ? { phase: 'answered', dotIndex: row.dot_index } : { phase: 'skipped' };
}

// Returns the Supabase error, or null.
export async function saveDayDot(userId, promptDate, dotIndex) {
  const { error } = await supabase
    .from('day_dots')
    .upsert(
      {
        user_id: userId,
        prompt_date: promptDate,
        status: 'answered',
        dot_index: dotIndex,
        answered_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,prompt_date' }
    );
  return error || null;
}

// Returns the Supabase error, or null.
export async function skipDayDot(userId, promptDate) {
  const { error } = await supabase
    .from('day_dots')
    .insert({
      user_id: userId,
      prompt_date: promptDate,
      status: 'skipped',
      dot_index: null,
      answered_at: new Date().toISOString(),
    });
  return error || null;
}
