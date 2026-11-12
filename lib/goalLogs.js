// lib/goalLogs.js
//
// "Nailed it!": one goal_logs row per tap on a token-earning Goal
// (supabase/migrations/0083_goal_logs.sql). Inserting the row is all the
// app does -- the database trigger award_token_on_goal_log adds the +1
// token, so there is no token code here. No Tickle is written.
// Both helpers return their result and never throw.

import { supabase } from './supabase';

// Logs one "Nailed it!" tap for this Goal. Returns { data, error }; data
// is { id } of the new row. The insert policy only accepts the user's own
// active (not Achieved) Goal that earns tokens.
export async function saveGoalLog(userId, goalId) {
  try {
    return await supabase
      .from('goal_logs')
      .insert({ user_id: userId, goal_id: goalId })
      .select('id')
      .single();
  } catch (error) {
    return { data: null, error };
  }
}

// How many "Nailed it!" taps this Goal has. Returns { count, error }.
export async function countGoalLogs(goalId) {
  try {
    const { count, error } = await supabase
      .from('goal_logs')
      .select('id', { count: 'exact', head: true })
      .eq('goal_id', goalId);
    return { count: error ? null : count ?? 0, error };
  } catch (error) {
    return { count: null, error };
  }
}
