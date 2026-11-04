import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The New Tickle / Quick Tickle button look (Task 3 H4): warm white fill,
// a 1.5dp dusk-blue border and a soft warm shadow. Fixed colours --
// deliberately NOT the accent theme (Button.js's secondary look, which
// these two used before, follows it). Tickle Stash's empty state uses the
// full-size 56dp pill; Home uses the slim pills below (the `home` prop,
// and TICKLE_BUTTON_SURFACE plus the HOME_ / QUICK_ values for its Quick
// Tickle button).
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

// Home's two buttons: slim pills, New Tickle ("+" and the words) on the
// left, Quick Tickle (three Vibe dots) at the far right, HOME_BUTTON_GAP
// apart. Each keeps a HOME_TAP_HEIGHT-tall tap area through hitSlop.
const HOME_PILL_HEIGHT = 30;
const HOME_TAP_HEIGHT = 44;
const HOME_PILL_SLOP = (HOME_TAP_HEIGHT - HOME_PILL_HEIGHT) / 2;
const HOME_PILL_ICON_SIZE = 16;
const HOME_PILL_FONT_SIZE = 14;
const HOME_PILL_PADDING = 16;
const HOME_PILL_ICON_GAP = 6;
const QUICK_PILL_WIDTH = 64;
export const HOME_BUTTON_GAP = 10;
export const HOME_BUTTON_HIT_SLOP = { top: HOME_PILL_SLOP, bottom: HOME_PILL_SLOP };
export const QUICK_BUTTON_SHAPE = {
  width: QUICK_PILL_WIDTH, height: HOME_PILL_HEIGHT, borderRadius: HOME_PILL_HEIGHT / 2,
};
export const QUICK_DOT_SIZE = 6;

// Pill with a "+" and "New Tickle". minHeight, so a large font scale
// grows it instead of clipping the label. With `home`, Home's slim pill.
export default function NewTickleButton({ onPress, style, home }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={home ? HOME_BUTTON_HIT_SLOP : undefined}
      style={[TICKLE_BUTTON_SURFACE, home ? styles.homePill : styles.pill, style]}
      accessibilityRole="button"
      accessibilityLabel="New Tickle"
    >
      <Ionicons name="add" size={home ? HOME_PILL_ICON_SIZE : 22} color={TICKLE_BUTTON_INK} />
      <Text style={home ? styles.homePillLabel : styles.label} numberOfLines={1}>New Tickle</Text>
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
  homePill: {
    minHeight: HOME_PILL_HEIGHT, borderRadius: HOME_PILL_HEIGHT / 2, paddingHorizontal: HOME_PILL_PADDING,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: HOME_PILL_ICON_GAP,
  },
  homePillLabel: { fontSize: HOME_PILL_FONT_SIZE, fontWeight: '600', color: TICKLE_BUTTON_INK, flexShrink: 1 },
});
