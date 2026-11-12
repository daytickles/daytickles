// lib/goalLogs.js
//
// "Nailed it!": one goal_logs row per tap on a token-earning Goal
// (supabase/migrations/0083_goal_logs.sql). Inserting the row is all the
// app does -- the database trigger award_token_on_goal_log adds the +1
// token, so there is no token code here. No Tickle is written.
// Every helper returns its result and never throws.

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

// This Goal's "Nailed it!" taps, newest first (at most 500), for the
// Goal screen's list. Returns { data: [{ id, created_at }], error }.
export async function listGoalLogs(goalId) {
  try {
    return await supabase
      .from('goal_logs')
      .select('id, created_at')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false })
      .limit(500);
  } catch (error) {
    return { data: null, error };
  }
}

// The user's taps with created_at in [startIso, endIso), for Your Week's
// Goals section. RLS limits it to the user's own rows. The caller adds a
// margin and filters on each tap's local date. Returns
// { data: [{ goal_id, created_at }], error }.
export async function listGoalLogsBetween(startIso, endIso) {
  try {
    return await supabase
      .from('goal_logs')
      .select('goal_id, created_at')
      .gte('created_at', startIso)
      .lt('created_at', endIso);
  } catch (error) {
    return { data: null, error };
  }
}

// The user's taps since sinceIso (an ISO timestamp), for Home's weekly
// target circles. RLS limits it to the user's own rows. Returns
// { data: [{ goal_id, created_at }], error }.
export async function listRecentGoalLogs(sinceIso) {
  try {
    return await supabase
      .from('goal_logs')
      .select('goal_id, created_at')
      .gte('created_at', sinceIso);
  } catch (error) {
    return { data: null, error };
  }
}
