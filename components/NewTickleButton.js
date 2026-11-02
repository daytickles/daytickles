import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The New Tickle / Quick Tickle button look (Task 3 H4): warm white fill,
// a 1.5dp dusk-blue border and a soft warm shadow, 56dp tall. Fixed
// colours -- deliberately NOT the accent theme (Button.js's secondary
// look, which these two used before, follows it). Home's Quick Tickle
// circle and Tickle Stash's empty state reuse TICKLE_BUTTON_SURFACE.
export const TICKLE_BUTTON_INK = '#425762';
export const TICKLE_BUTTON_HEIGHT = 56;

export const TICKLE_BUTTON_SURFACE = {
  backgroundColor: '#FFFDF7',
  borderWidth: 1.5,
  borderColor: TICKLE_BUTTON_INK,
  // rgba(74,31,16,0.35) as the colour with opacity 1, so iOS and Android
  // (API 28+, with elevation) both use the same 35% warm shadow.
  shadowColor: 'rgba(74,31,16,0.35)',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 1,
  shadowRadius: 6,
  elevation: 4,
};

// Pill with a "+" and "New Tickle". minHeight, so a large font scale
// grows it instead of clipping the label.
export default function NewTickleButton({ onPress, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[TICKLE_BUTTON_SURFACE, styles.pill, style]}
      accessibilityRole="button"
      accessibilityLabel="New Tickle"
    >
      <Ionicons name="add" size={22} color={TICKLE_BUTTON_INK} />
      <Text style={styles.label} numberOfLines={1}>New Tickle</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: TICKLE_BUTTON_HEIGHT, borderRadius: TICKLE_BUTTON_HEIGHT / 2,
    paddingHorizontal: 22, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  label: { fontSize: 19, fontWeight: '600', color: TICKLE_BUTTON_INK, flexShrink: 1 },
});
