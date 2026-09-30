import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C } from '../lib/theme';
import Button from './Button';

// Opened from the info icon next to the "Be a Moji" heading on
// founding-member.js. Same overlay/sheet/"Got it" shape as
// PhotoTickleDisclosureModal -- the app had no inline info-icon popup
// before this, so it borrows that small single-screen sheet rather than
// inventing a new one. Tapping outside the sheet also dismisses, same as
// AboutModal.
export default function MojicianInfoModal({ visible, onDismiss }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
        <View style={styles.sheet}>
          <Text style={styles.heading}>
            Mojician <Text style={styles.partOfSpeech}>(noun)</Text>
          </Text>
          <Text style={styles.body}>
            Also called a Moji, is a person with a knack for finding, making and spreading mojo in
            everyday life.
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
  partOfSpeech: { fontSize: 15, fontWeight: '400', fontStyle: 'italic', color: C.subtext },
  body: { fontSize: 15, color: C.text, lineHeight: 21, marginBottom: 12 },
  navRow: { flexDirection: 'row', justifyContent: 'flex-end' },
});
