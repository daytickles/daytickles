// components/TesterFeedbackPill.js
//
// TEMPORARY (closed testing) -- the "Test ideas for today" pill under
// Home's New Tickle button. Remove this file, lib/testerFeedback.js and
// the home.js lines before public release (feedback_pill_audit.md
// section 9; tables from migration 0070, dropped by a later migration).
//
// Entirely self-contained: it loads on its own focus (nothing in Home
// awaits it) and renders nothing at all when there are no tasks --
// which is what a non-tester, a day without tasks and a failed load all
// look like. Answers save on every tap (optimistic), only ever to the
// tester's own feedback_answers rows; never to profiles.

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { fetchTodayTasks, saveAnswer } from '../lib/testerFeedback';
import { C, withAlpha } from '../lib/theme';

// Deliberately not a theme token -- this pill should read as "not part
// of the app" and go away with it.
const OUTLINE = '#8A6D2B';

const ANSWERS = [
  { value: 'worked', label: 'Worked' },
  { value: 'problem', label: 'Problem' },
  { value: 'skipped', label: "Didn't try" },
];

// How far above the keyboard the note box's bottom edge should sit, so
// the "Save note" row under it stays visible too.
const NOTE_KEYBOARD_GAP = 56;

// scrollRef: Home's main ScrollView. This app runs edge-to-edge, so
// Android doesn't resize the window for the keyboard; instead the note
// box asks that ScrollView to scroll it clear of the keyboard.
export default function TesterFeedbackPill({ scrollRef }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  // [{ id, title, detail, answer, note, draft, error }] -- `note` is the
  // last note sent (or loaded), `draft` what's in the box right now.
  const [tasks, setTasks] = useState([]);
  const [open, setOpen] = useState(false);
  // Task id whose note box should take focus on mount: only when the
  // tester has just picked Problem, never for a note loaded from the DB.
  const [focusNoteFor, setFocusNoteFor] = useState(null);

  const loadSeq = useRef(0);
  // Per task: a promise chain, so one task's upserts reach the server in
  // tap order (quick taps always end on the last one) while every tap
  // still sends exactly one upsert; a request counter, so only the
  // latest request's result touches the UI; and the last attempt, for
  // "Tap to retry".
  const queues = useRef(new Map());
  const reqSeq = useRef(new Map());
  const lastAttempt = useRef(new Map());
  // Latest committed tasks, for handlers that can run after a re-render
  // made their closure stale -- e.g. the note box's onBlur firing as it
  // unmounts right after a switch from Problem to Worked, which must not
  // queue a late 'problem' save behind the 'worked' one.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const current = (id) => tasksRef.current.find((t) => t.id === id);
  // Per task, the note text last sent (or loaded). Kept in a ref rather
  // than state so two saveNote calls in the same tick -- e.g. choose()
  // saving it and then the dismissed box's own blur -- can't both send.
  const sentNote = useRef(new Map());

  // Note boxes by task id, and which one has focus.
  const noteRefs = useRef(new Map());
  const focusedNote = useRef(null);
  function revealNote(id) {
    const input = noteRefs.current.get(id);
    scrollRef?.current?.scrollResponderScrollNativeHandleToKeyboard?.(input, NOTE_KEYBOARD_GAP, true);
  }
  // keyboardDidShow covers the first open (the keyboard height isn't
  // known yet at focus time); onFocus below covers moving between boxes
  // while it's already up.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (focusedNote.current) revealNote(focusedNote.current);
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setTasks([]);
        return undefined;
      }
      const seq = ++loadSeq.current;
      fetchTodayTasks().then((rows) => {
        if (seq !== loadSeq.current) return;
        setTasks((prev) => {
          const byId = new Map(prev.map((t) => [t.id, t]));
          return rows.map((r) => {
            const local = byId.get(r.id);
            // A save still queued for this task wins over the server copy,
            // which may predate it.
            if (local && queues.current.get(r.id)?.busy) return local;
            sentNote.current.set(r.id, r.note || '');
            return { ...r, draft: r.note || '', error: false };
          });
        });
      });
      return undefined;
    }, [userId])
  );

  function patchTask(id, patch) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function save(taskId, answer, note) {
    lastAttempt.current.set(taskId, { answer, note });
    const req = (reqSeq.current.get(taskId) || 0) + 1;
    reqSeq.current.set(taskId, req);
    const q = queues.current.get(taskId) || { chain: Promise.resolve(), busy: 0 };
    q.busy += 1;
    q.chain = q.chain.then(async () => {
      const { ok } = await saveAnswer(taskId, answer, note);
      q.busy -= 1;
      if (reqSeq.current.get(taskId) === req) patchTask(taskId, { error: !ok });
    });
    queues.current.set(taskId, q);
  }

  function choose(taskId, answer) {
    const task = current(taskId);
    if (!task || task.answer === answer) return;
    // With keyboardShouldPersistTaps="handled" on Home, tapping another
    // task's answer leaves the note box focused, so its blur never comes:
    // save that note now and put the keyboard away.
    const typing = focusedNote.current;
    if (typing && typing !== taskId) {
      saveNote(typing);
      Keyboard.dismiss();
    }
    const note = answer === 'problem' ? task.draft : null;
    sentNote.current.set(task.id, note || '');
    patchTask(task.id, {
      answer,
      note: answer === 'problem' ? task.draft : null,
      draft: answer === 'problem' ? task.draft : '',
      error: false,
    });
    if (answer === 'problem') setFocusNoteFor(task.id);
    save(task.id, answer, note);
  }

  // Blur and the "Save note" link both land here; skips the upsert when
  // the box hasn't changed since the last note sent.
  function saveNote(taskId) {
    const task = current(taskId);
    if (!task || task.answer !== 'problem' || task.draft === (sentNote.current.get(taskId) ?? '')) return;
    sentNote.current.set(taskId, task.draft);
    patchTask(task.id, { note: task.draft, error: false });
    save(task.id, 'problem', task.draft);
  }

  function retry(task) {
    const last = lastAttempt.current.get(task.id);
    if (!last) return;
    patchTask(task.id, { error: false });
    save(task.id, last.answer, last.note);
  }

  if (tasks.length === 0) return null;

  const count = tasks.length;
  // Derived, never stored: every one of today's tasks has an answer (a
  // Problem with no note still counts -- the note is optional). Resets on
  // its own tomorrow (new, unanswered dated rows) and drops back to
  // partial if a task is added later today. The panel deliberately does
  // NOT collapse when this flips, so a last-moment Problem still gets
  // its note box.
  const complete = tasks.every((t) => !!t.answer);
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.pill, complete && styles.pillDone]}
        activeOpacity={0.8}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          complete
            ? 'Test ideas for today, all answered. Thank you.'
            : `Test ideas for today, ${count} idea${count === 1 ? '' : 's'}.`
        }
      >
        <Text style={[styles.pillText, complete && styles.pillTextDone]}>
          {complete ? 'Test ideas for today ✓' : 'Test ideas for today'}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={complete ? C.text : C.amberText}
        />
      </TouchableOpacity>

      {/* In-flow, never absolute: opening it pushes Home's cards down
          instead of covering them (and catching their taps). */}
      {open && (
        <View style={styles.panel}>
          {complete ? (
            <Text style={styles.thanks}>
              Thank you, that's everything for today. You can still change any answer below.
            </Text>
          ) : (
            <Text style={styles.helper}>Try these when you have a minute, then tap how it went.</Text>
          )}
          {tasks.map((t) => (
            <View key={t.id} style={styles.task}>
              <Text style={styles.taskTitle}>{t.title}</Text>
              {!!t.detail && <Text style={styles.taskDetail}>{t.detail}</Text>}

              <View style={styles.answerRow}>
                {ANSWERS.map((a) => {
                  const selected = t.answer === a.value;
                  return (
                    <TouchableOpacity
                      key={a.value}
                      style={[styles.answerBtn, selected && styles[`answerBtn_${a.value}`]]}
                      activeOpacity={0.7}
                      hitSlop={{ top: 4, bottom: 4 }}
                      onPress={() => choose(t.id, a.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${a.label} for ${t.title}`}
                    >
                      <Text style={[styles.answerText, selected && styles.answerTextSelected]}>{a.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {t.answer === 'problem' && (
                <View style={styles.noteWrap}>
                  <TextInput
                    ref={(el) => {
                      if (el) noteRefs.current.set(t.id, el);
                      else noteRefs.current.delete(t.id);
                    }}
                    style={styles.noteInput}
                    value={t.draft}
                    onChangeText={(text) => patchTask(t.id, { draft: text })}
                    onFocus={() => {
                      focusedNote.current = t.id;
                      if (Keyboard.isVisible()) revealNote(t.id);
                    }}
                    onBlur={() => {
                      if (focusedNote.current === t.id) focusedNote.current = null;
                      saveNote(t.id);
                    }}
                    placeholder="What went wrong? (optional)"
                    placeholderTextColor={C.faint}
                    multiline
                    maxLength={500}
                    autoFocus={focusNoteFor === t.id}
                    accessibilityLabel={`Problem note for ${t.title}`}
                  />
                  <View style={styles.noteFooter}>
                    <Text style={styles.noteHint}>Please don't include personal details.</Text>
                    <TouchableOpacity
                      onPress={() => saveNote(t.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Save note for ${t.title}`}
                    >
                      <Text style={styles.link}>Save note</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {t.error && (
                <TouchableOpacity
                  onPress={() => retry(t)}
                  hitSlop={{ top: 8, bottom: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Not saved. Tap to retry ${t.title}`}
                >
                  <Text style={styles.errorText}>Not saved. Tap to retry</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // marginTop only -- whatever follows (loader, QuickStartCard, the
  // bottom cards) already brings its own 12dp top margin.
  wrap: { marginTop: 12 },
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 999, borderWidth: 1.5, borderColor: OUTLINE, backgroundColor: C.amberBg,
  },
  pillText: { fontSize: 15, fontWeight: '700', color: C.amberText },
  // All answered: same shape and size, calm beige instead of the yellow.
  pillDone: { backgroundColor: C.sparkleBg, borderColor: withAlpha(OUTLINE, 0.5) },
  pillTextDone: { color: C.text },
  thanks: {
    fontSize: 13, color: C.text, lineHeight: 18, marginBottom: 4,
    backgroundColor: C.sparkleBg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
  },
  panel: {
    marginTop: 8, padding: 12, borderRadius: 16,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  helper: { fontSize: 13, color: C.subtext, lineHeight: 18, marginBottom: 4 },
  task: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  taskTitle: { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 19 },
  taskDetail: { fontSize: 12, color: C.subtext, lineHeight: 17, marginTop: 2 },

  answerRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  // 36dp tall plus a 4dp hitSlop above and below = a 44dp touch target.
  answerBtn: {
    minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  answerBtn_worked: { backgroundColor: C.teal, borderColor: C.teal },
  answerBtn_problem: { backgroundColor: C.error, borderColor: C.error },
  answerBtn_skipped: { backgroundColor: C.subtext, borderColor: C.subtext },
  answerText: { fontSize: 13, fontWeight: '600', color: C.text },
  answerTextSelected: { color: C.card },

  noteWrap: { marginTop: 8 },
  noteInput: {
    minHeight: 64, maxHeight: 120, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg,
    fontSize: 14, color: C.text, textAlignVertical: 'top',
  },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  noteHint: { flex: 1, fontSize: 11, color: C.subtext, marginRight: 8 },
  link: { fontSize: 13, fontWeight: '700', color: C.rust },
  errorText: { fontSize: 12, fontWeight: '600', color: C.error, marginTop: 6 },
});
