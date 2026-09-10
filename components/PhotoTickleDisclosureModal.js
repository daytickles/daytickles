import { Modal, View, Text, StyleSheet } from 'react-native';
import { C } from '../lib/theme';
import Button from './Button';

// One-time, shown the first time someone ever taps a Vibe icon OR the My
// Day sun icon on a Tickle Pics photo (see pinboard.js's
// handlePhotoVibeTap) -- same overlay/sheet/"Got it" shape as AboutModal,
// just a single short screen instead of a scrollable one. Dismissing it
// is also the moment the device media-library write permission actually
// gets requested (inside saveToDeviceLibrary, called right after), so
// there's no separate permission prompt later.
//
// isDayJournal picks which of the two copy variants below renders, based
// on whichever icon triggered THIS tap -- since the underlying seen-flag
// is a single one-time-ever gate (not per-icon-type), whichever kind a
// person happens to tap first is the only copy they'll ever see here.
// Vibe-flavored copy wrongly claims "you can make it public any time",
// which is false for My Day (see EntryCard.js's isJournal-gated
// visibility toggle) -- hence the separate variant, not just a reworded
// single copy.
export default function PhotoTickleDisclosureModal({ visible, onDismiss, isDayJournal }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {isDayJournal ? (
            <>
              <Text style={styles.heading}>Adding this to My Day</Text>
              <Text style={styles.body}>
                Tapping the sun icon instantly adds this photo to My Day — no writing
                required. My Day entries are always private, just for you, and can't be made
                public.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.heading}>Creating a Tickle from this photo</Text>
              <Text style={styles.body}>
                Tapping a Vibe icon instantly turns this photo into a new Tickle — no writing
                required. It's created as private, just for you; you can make it public any time
                from the Tickle itself.
              </Text>
            </>
          )}
          <Text style={styles.body}>
            Your photo is also automatically saved to your device's Photos app, for
            safekeeping — this happens every time, so there's always a backup outside
            DayTickles.
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
