import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, AWARD_TYPES, AWARD_ORDER } from '../lib/theme';

// Unlike GoalTagModal, there is no "remove" row here -- an award is
// permanent once given (enforced server-side too, see migration 0020's
// awards RLS: only SELECT/INSERT policies exist, no UPDATE or DELETE),
// so once entryId's award is set this modal is never opened for it
// again (EntryCard only wires onGiveAward up while awardType is still
// null).
export default function AwardPickerModal({ entryId, onGive, onDismiss }) {
  return (
    <Modal visible={!!entryId} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.pickerTitle}>Give an award</Text>
          <Text style={styles.pickerSubtitle}>This can't be changed once given.</Text>

          {AWARD_ORDER.map((key) => {
            const award = AWARD_TYPES[key];
            return (
              <TouchableOpacity
                key={key}
                style={styles.pickerRow}
                onPress={() => onGive(key)}
              >
                <Ionicons name={award.iconActive} size={20} color={award.color} />
                <View style={styles.pickerRowText}>
                  <Text style={styles.pickerRowLabel}>{award.label}</Text>
                  <Text style={styles.pickerRowDescription}>{award.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
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
  pickerTitle: { fontSize: 16, fontWeight: '600', color: C.rustDark, marginBottom: 4 },
  pickerSubtitle: { fontSize: 12, color: C.subtext, marginBottom: 12 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  pickerRowText: { marginLeft: 12, flexShrink: 1 },
  pickerRowLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  pickerRowDescription: { fontSize: 12, color: C.subtext, marginTop: 2 },
});
