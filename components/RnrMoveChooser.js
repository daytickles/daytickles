import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { C } from '../lib/theme';
import { RNR_SLOTS, RNR_SLOT_LABELS } from '../lib/rnrs';

// "Move to" for one tile: the three slots of the same day, and, when
// onAnotherDay is given, "Another day..." (components/RnrDayPicker.js).
// The tile's own slot is shown but can't be picked. Close, Android Back and the
// dimmed area close it without moving anything.
export default function RnrMoveChooser({ placement, onPickSlot, onAnotherDay, onClose }) {
  const visible = !!placement;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        {visible && (
          <View style={styles.sheet}>
            <Text style={styles.title} accessibilityRole="header">Move to</Text>
            <Text style={styles.subtitle} numberOfLines={2}>{placement.label}</Text>
            {RNR_SLOTS.map((s) => {
              const here = s === placement.slot;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.option, here && styles.optionHere]}
                  disabled={here}
                  onPress={() => onPickSlot(s)}
                  accessibilityRole="button"
                  accessibilityLabel={here ? `${RNR_SLOT_LABELS[s]}, already here` : RNR_SLOT_LABELS[s]}
                  accessibilityState={{ disabled: here }}
                >
                  <Text style={[styles.optionText, here && styles.optionTextHere]}>
                    {RNR_SLOT_LABELS[s]}{here ? '  (here now)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {!!onAnotherDay && (
              <TouchableOpacity
                style={styles.option}
                onPress={onAnotherDay}
                accessibilityRole="button"
                accessibilityLabel="Another day"
              >
                <Text style={styles.optionText}>Another day…</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.cancel}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

export const moveChooserStyles = StyleSheet.create({
  // EntryCard's menuBackdrop dim, sheet centred.
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 320, gap: 8,
    backgroundColor: C.card, borderRadius: 22, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  title: { fontSize: 16, fontWeight: '700', color: C.rustDark },
  subtitle: { fontSize: 13, color: C.subtext, marginBottom: 4 },
  option: {
    minHeight: 48, justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg,
  },
  optionHere: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: C.faint },
  optionText: { fontSize: 15, fontWeight: '600', color: C.text },
  optionTextHere: { color: C.subtext, fontWeight: '400' },
  cancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  cancelText: { fontSize: 14, fontWeight: '700', color: C.subtext },
});

const styles = moveChooserStyles;
