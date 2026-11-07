// components/AwardHand.js
//
// The High Five hand, as drawn everywhere a given High Five shows (the
// badges on Tickle cards and Your Week, the give picker, Notifications,
// Your Week's High Fives list): the filled hand in the type's colour,
// with the matching outline hand drawn exactly on top of it in a darker
// shade of that colour, so light colours (the yellow especially) still
// stand out on cream and white.
//
// Decoration only: hidden from TalkBack, so whatever wraps it keeps its
// own label ("High Five: Epic!" and so on).

import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AWARD_HAND_ICON, darken } from '../lib/theme';

const OUTLINE_ICON = 'hand-right-outline';
const OUTLINE_DARKEN = 0.35;

export default function AwardHand({ color, size, style }) {
  return (
    <View
      style={style}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={AWARD_HAND_ICON} size={size} color={color} />
      <Ionicons name={OUTLINE_ICON} size={size} color={darken(color, OUTLINE_DARKEN)} style={styles.outline} />
    </View>
  );
}

const styles = StyleSheet.create({
  // The wrapper takes the filled hand's own size (as the plain icon did
  // before, so nothing around it moves); the outline sits on top of it at
  // the same size and origin, so the two line up.
  outline: { position: 'absolute', top: 0, left: 0 },
});
