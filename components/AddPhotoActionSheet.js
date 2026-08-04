import { Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';

// Same Modal/backdrop/sheet shape as GoalTagModal, replacing the native
// Alert.alert action sheet the Pin Board used to show — themed instead
// of a plain OS dialog. `visible` doubles as the gate, same convention
// as PhotoEnlargeModal's `uri` prop.
export default function AddPhotoActionSheet({ visible, onTakePhoto, onChooseFromLibrary, onDismiss }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Add Photo</Text>

          <TouchableOpacity style={styles.optionRow} onPress={onTakePhoto}>
            <Ionicons name="camera-outline" size={18} color={C.rustDark} />
            <Text style={styles.optionLabel}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionRow} onPress={onChooseFromLibrary}>
            <Ionicons name="images-outline" size={18} color={C.rustDark} />
            <Text style={styles.optionLabel}>Choose from Library</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onDismiss} style={styles.cancel}>
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
  sheet: { width: '100%', backgroundColor: C.card, borderRadius: 18, padding: 16 },
  title: { fontSize: 16, fontWeight: '600', color: C.rustDark, marginBottom: 12, textAlign: 'center' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  optionLabel: { fontSize: 15, color: C.text, marginLeft: 12 },
  cancel: { alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  cancelText: { fontSize: 14, color: C.subtext, fontWeight: '600' },
});
