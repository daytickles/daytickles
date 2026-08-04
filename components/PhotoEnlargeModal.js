import { Modal, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Shared by the Pin Board screen's own tap-to-enlarge and EntryCard's
// reverse photo indicator — `uri` doubles as the visibility gate (same
// shape as GoalTagModal's `entry` prop), so there's no separate boolean
// to keep in sync with it.
export default function PhotoEnlargeModal({ uri, onDismiss }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          {uri && <Image source={{ uri }} style={styles.image} resizeMode="contain" />}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: { width: '92%', height: '75%' },
  closeButton: { position: 'absolute', top: 50, right: 24 },
});
