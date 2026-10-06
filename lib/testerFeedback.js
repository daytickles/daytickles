// lib/testerFeedback.js
//
// TEMPORARY (closed testing) -- reads for Home's "Test ideas for today"
// pill (components/TesterFeedbackPill.js). Remove both, plus the
// home.js lines, before public release; see feedback_pill_audit.md
// section 9 and migration 0070.
//
// Who sees anything is decided server-side: the feedback_tasks select
// policy only returns rows to users listed in public.testers, so a
// non-tester simply gets [] and the pill hides. Writes go only to the
// tester's own feedback_answers rows (RLS checks user_id and is_tester()
// again) -- never to profiles.

import { supabase } from './supabase';
import { localDateString } from './week';

// Today's active tasks, each with the signed-in user's own answer (if
// any) embedded -- feedback_answers' RLS only ever returns the caller's
// rows, so `feedback_answers` is [] or a single { answer, note }.
// "Today" is the device's local day, same boundary as entry_date (see
// lib/week.js). Tasks are dated rows, one per task per day; a null
// active_date means "every day while active". Never throws: any error
// returns [], which hides the pill.
export async function fetchTodayTasks() {
  try {
    const today = localDateString();
    const { data, error } = await supabase
      .from('feedback_tasks')
      .select('id, title, detail, sort_order, feedback_answers(answer, note)')
      .or(`active_date.is.null,active_date.eq.${today}`)
      .order('sort_order', { ascending: true });
    if (error || !data) return [];
    return data.map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail,
      answer: t.feedback_answers?.[0]?.answer || null,
      note: t.feedback_answers?.[0]?.note || null,
    }));
  } catch {
    return [];
  }
}

// Saves (insert or replace) the signed-in user's answer to one task.
// answer is 'worked' | 'problem' | 'skipped'; only 'problem' keeps a
// note, so switching away from Problem clears it. user_id always comes
// from the current session, never from the caller. Never throws:
// returns { ok: true } or { ok: false }.
export async function saveAnswer(taskId, answer, note) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return { ok: false };
    const trimmed = typeof note === 'string' ? note.trim() : '';
    const { error } = await supabase.from('feedback_answers').upsert(
      {
        task_id: taskId,
        user_id: userId,
        answer,
        note: answer === 'problem' && trimmed ? trimmed : null,
      },
      { onConflict: 'task_id,user_id' }
    );
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
