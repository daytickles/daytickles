import { Modal, View, Text, StyleSheet } from 'react-native';
import { C } from '../lib/theme';
import Button from './Button';

// One-time, shown the first time someone ever taps a Vibe icon on a
// Tickle Pics photo (see pinboard.js's handlePhotoVibeTap) -- same
// overlay/sheet/"Got it" shape as AboutModal, just a single short
// screen instead of a scrollable one. Dismissing it is also the moment
// the device media-library write permission actually gets requested
// (inside saveToDeviceLibrary, called right after), so there's no
// separate permission prompt later.
export default function PhotoTickleDisclosureModal({ visible, onDismiss }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>Saving this photo</Text>
          <Text style={styles.body}>
            Photo Tickles are automatically saved to your device's Photos app, for safekeeping.
            This keeps a backup copy outside DayTickles, in case anything ever happens to a photo
            stored only here.
          </Text>
          <Text style={styles.body}>
            This happens automatically every time — you won't be asked again.
          </Text>
          <View style={styles.navRow}>
            <Button title="Got it" variant="primary" onPress={onDismiss} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    width: '100%', backgroundColor: C.card, borderRadius: 18, padding: 20,
  },
  heading: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginBottom: 10 },
  body: { fontSize: 15, color: C.text, lineHeight: 21, marginBottom: 12 },
  navRow: { flexDirection: 'row', justifyContent: 'flex-end' },
});
