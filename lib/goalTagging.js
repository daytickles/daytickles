// lib/goalTagging.js
//
// Centralizes the tickle_entries.goal_id write that used to be
// triplicated (identically) across home.js/calendar.js/feed.js's own
// assignGoal functions. Token earning itself is NOT triggered from
// here -- it's driven entirely server-side by award_token_on_goal_tag
// (see migration 0065), keyed off a genuine change of goal_id, so a
// re-tap on an already-tagged Goal can never earn twice even if a
// caller skipped the no-op guard below. That guard exists purely to
// skip a wasted round-trip, not as the source of truth for
// farm-prevention.

import { supabase } from './supabase';

export async function assignEntryGoal({ entryId, goalId, currentGoalId, setEntries }) {
  if (goalId === currentGoalId) return;

  let previous;
  setEntries((prev) => {
    previous = prev;
    return prev.map((e) => (e.id === entryId ? { ...e, goal_id: goalId } : e));
  });

  const { error } = await supabase
    .from('tickle_entries')
    .update({ goal_id: goalId })
    .eq('id', entryId);

  if (error) setEntries(previous);
}
