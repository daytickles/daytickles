// components/TesterFeedbackPill.js
//
// TEMPORARY (closed testing) -- the "Test ideas for today" pill under
// Home's New Tickle button. Remove this file, lib/testerFeedback.js and
// the two home.js lines before public release (feedback_pill_audit.md
// section 9; tables from migration 0070, dropped by a later migration).
//
// Phase 2: read-only. Shows today's tasks and any answer already given;
// answering comes later. Entirely self-contained: it loads on its own
// focus (nothing in Home awaits it), never writes anything, and renders
// nothing at all when there are no tasks -- which is what a non-tester,
// a day without tasks and a failed load all look like.

import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { fetchTodayTasks } from '../lib/testerFeedback';
import { C } from '../lib/theme';

// Deliberately not a theme token -- this pill should read as "not part
// of the app" and go away with it.
const OUTLINE = '#8A6D2B';

const ANSWER_LABELS = { worked: 'Worked', problem: 'Problem', skipped: "Didn't try" };

export default function TesterFeedbackPill() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [tasks, setTasks] = useState([]);
  const [open, setOpen] = useState(false);
  // Guards against a slow load from a previous focus (or a previous
  // account, after a sign-out/in) landing after a newer one.
  const loadSeq = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setTasks([]);
        return undefined;
      }
      const seq = ++loadSeq.current;
      fetchTodayTasks().then((rows) => {
        if (seq === loadSeq.current) setTasks(rows);
      });
      return undefined;
    }, [userId])
  );

  if (tasks.length === 0) return null;

  const count = tasks.length;
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.pill}
        activeOpacity={0.8}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Test ideas for today, ${count} idea${count === 1 ? '' : 's'}.`}
      >
        <Text style={styles.pillText}>Test ideas for today</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.amberText} />
      </TouchableOpacity>

      {/* In-flow, never absolute: opening it pushes Home's cards down
          instead of covering them (and catching their taps). */}
      {open && (
        <View style={styles.panel}>
          <Text style={styles.helper}>Try these when you have a minute, then tap how it went.</Text>
          {tasks.map((t) => (
            <View key={t.id} style={styles.task}>
              <Text style={styles.taskTitle}>{t.title}</Text>
              {!!t.detail && <Text style={styles.taskDetail}>{t.detail}</Text>}
              {!!t.answer && (
                <Text style={styles.answerMarker}>Your answer: {ANSWER_LABELS[t.answer] || t.answer}</Text>
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
  panel: {
    marginTop: 8, padding: 12, borderRadius: 16,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  helper: { fontSize: 13, color: C.subtext, lineHeight: 18, marginBottom: 4 },
  task: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  taskTitle: { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 19 },
  taskDetail: { fontSize: 12, color: C.subtext, lineHeight: 17, marginTop: 2 },
  answerMarker: { fontSize: 12, fontWeight: '600', color: C.rust, marginTop: 4 },
});
