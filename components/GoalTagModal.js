import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, darken, lighten } from '../lib/theme';

// `goals` is the assignable (active, not-yet-achieved) list — achieved
// goals are never offered as a new tag target. `taggedGoal` is the
// entry's current tag, whatever its state; when it's achieved it's
// rendered read-only above the assignable list rather than as a
// pickable row, so the modal still shows what the entry is tagged with.
export default function GoalTagModal({ entry, goals, taggedGoal, onAssign, onDismiss }) {
  return (
    <Modal visible={!!entry} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.pickerTitle}>Tag with a goal</Text>

          {taggedGoal?.achieved_at && (
            <View style={[styles.pickerRow, styles.pickerRowReadOnly]}>
              <View style={[styles.goalDot, { backgroundColor: lighten(taggedGoal.color, 0.6) }]}>
                <Ionicons name="checkmark" size={10} color={darken(taggedGoal.color, 0.4)} />
              </View>
              <Text style={[styles.pickerRowLabel, styles.pickerRowLabelMuted]}>
                {taggedGoal.label} (achieved)
              </Text>
            </View>
          )}

          {goals.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={styles.pickerRow}
              onPress={() => onAssign(g.id)}
            >
              <View style={[styles.goalDot, { backgroundColor: g.color }]} />
              <Text style={styles.pickerRowLabel}>{g.label}</Text>
            </TouchableOpacity>
          ))}

          {goals.length === 0 && (
            <Text style={styles.pickerEmpty}>No goals available to tag — add one from Manage Goals.</Text>
          )}

          {entry?.goal_id && (
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => onAssign(null)}
            >
              <View style={[styles.goalDot, styles.goalDotEmpty]} />
              <Text style={styles.pickerRowLabel}>Remove tag</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  pickerSheet: {
    width: '100%', backgroundColor: C.card, borderRadius: 18, padding: 16,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: C.rustDark, marginBottom: 12 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  pickerRowLabel: { fontSize: 15, color: C.text, marginLeft: 12 },
  pickerRowLabelMuted: { color: C.subtext },
  pickerRowReadOnly: { opacity: 0.85 },
  pickerEmpty: { fontSize: 14, color: C.subtext, fontStyle: 'italic', paddingVertical: 8 },
  goalDot: {
    width: 16, height: 16, borderRadius: 8, marginLeft: 12, marginTop: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  goalDotEmpty: {
    backgroundColor: 'transparent', borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: C.faint,
  },
});
