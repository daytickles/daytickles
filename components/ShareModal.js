import { Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { C } from '../lib/theme';

export default function ShareModal({ entry, captions, blocked, cap, onConfirm, onDismiss }) {
  return (
    <Modal visible={!!entry} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={styles.pickerSheet} onPress={() => {}}>
          {blocked ? (
            <>
              <Text style={styles.pickerTitle}>Share limit reached</Text>
              <Text style={styles.shareBlockedText}>
                You've used all {cap} shares for this 30-day period. It renews
                automatically, or go unlimited with a paid plan.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.pickerTitle}>Share this tickle</Text>
              {captions.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.pickerRow}
                  onPress={() => onConfirm(c.id)}
                >
                  <Text style={styles.pickerRowLabel}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </>
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
  shareBlockedText: { fontSize: 14, color: C.subtext, lineHeight: 20 },
});
