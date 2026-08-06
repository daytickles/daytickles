import { Modal, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C } from '../lib/theme';

// Same Modal/backdrop/sheet/destructive-button shape as DeleteAccountModal
// — deliberately without its typed-confirmation gate, which that
// component's own comment reserves for the account-wide irreversible
// case. A single photo just needs the themed equivalent of a destructive
// Alert.alert, not a harder-to-hit-by-accident gate.
export default function DeletePhotoModal({ visible, onConfirm, onCancel }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Delete this photo?</Text>
          <Text style={styles.body}>
            This removes it from your Tickle Pics and deletes the photo from this device. This
            can't be undone.
          </Text>

          <TouchableOpacity style={styles.deleteButton} onPress={onConfirm}>
            <Text style={styles.deleteButtonText}>Delete Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  sheet: { width: '100%', backgroundColor: C.bg, borderRadius: 18, padding: 24 },
  title: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, color: C.text, lineHeight: 20, marginBottom: 16, textAlign: 'center' },
  deleteButton: {
    backgroundColor: C.error,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteButtonText: { color: C.bg, fontWeight: '700', fontSize: 15 },
  cancel: { alignItems: 'center' },
  cancelText: { fontSize: 14, color: C.subtext, fontWeight: '600' },
});
