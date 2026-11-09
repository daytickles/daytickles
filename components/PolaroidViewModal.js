// components/PolaroidViewModal.js
//
// A sent Polaroid, larger, as it was sent: the same ShareCard layout the
// share image is made from (photo, caption, the accent-colour divider
// dot and the "DayTickles App" footer). View only: no share, edit or
// delete. Closed by tapping outside it, the Close button or Back. Same
// fading, dimmed Modal as the app's other pop-ups.
//
// item: one of lib/polaroidsSent.js's items, or null when closed. The
// card is scaled down (never up) to fit small screens.
import { useState } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import ShareCard from './ShareCard';
import Button from './Button';

const CARD_WIDTH = 320; // ShareCard's own width
const SIDE_ROOM = 32; // 16dp each side
const BUTTON_ROOM = 120; // the Close button, its gap and the top/bottom space

export default function PolaroidViewModal({ item, accentColor, onClose }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [cardHeight, setCardHeight] = useState(0);
  const scale = Math.min(
    1,
    (windowWidth - SIDE_ROOM) / CARD_WIDTH,
    cardHeight > 0 ? (windowHeight - BUTTON_ROOM) / cardHeight : 1
  );

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        {!!item && (
          <View
            style={{ width: CARD_WIDTH * scale, height: (cardHeight || 0) * scale, alignItems: 'center', justifyContent: 'center' }}
            pointerEvents="none"
          >
            {/* Hidden until measured, so it never overlaps Close. */}
            <View
              style={{ transform: [{ scale }], opacity: cardHeight > 0 ? 1 : 0 }}
              onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
            >
              <ShareCard photo={item.photo} captionLabel={item.captionLabel} accentColor={accentColor} />
            </View>
          </View>
        )}
        <View style={styles.closeRow}>
          <Button title="Close" onPress={onClose} variant="secondary" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  closeRow: { marginTop: 16, minWidth: 140 },
});
