import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C, accentFor, darken, textOn } from '../lib/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  BUTTON_HEIGHT, BUTTON_HIT_SLOP, BUTTON_RADIUS, BUTTON_FONT_SIZE, BUTTON_PADDING_X,
  MAIN_BUTTON_HEIGHT, MAIN_BUTTON_RADIUS, MAIN_BUTTON_FONT_SIZE, MAIN_BUTTON_HIT_SLOP,
} from '../lib/buttonSize';

// No accent_theme yet (e.g. pre-auth on login) falls through
// accentFor(undefined) to the rust theme — same shade this defaulted to
// before accent-awareness existed here, so nothing changes for that case.
//
// size: 'pill' (default) is Home's 30dp pill; 'main' is the 40dp main
// action on a screen. Both use minHeight, so a large font size grows the
// button instead of clipping it, and both keep a 44dp-tall tap area
// through hitSlop (lib/buttonSize.js).
export default function Button({ title, onPress, variant = 'primary', size = 'pill', disabled = false, color, style }) {
  const isPrimary = variant === 'primary';
  const isMain = size === 'main';
  const { profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);

  const resolvedColor = color || accentDark;
  const resolvedTextColor = isPrimary ? textOn(resolvedColor) : resolvedColor;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      hitSlop={isMain ? MAIN_BUTTON_HIT_SLOP : BUTTON_HIT_SLOP}
      style={[
        styles.base,
        isMain ? styles.main : styles.pill,
        isPrimary
          ? { backgroundColor: resolvedColor }
          : { backgroundColor: C.bg, borderWidth: 1.5, borderColor: resolvedColor },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[isMain ? styles.mainText : styles.pillText, { color: resolvedTextColor }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 0,
    paddingHorizontal: BUTTON_PADDING_X,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: { minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS },
  main: { minHeight: MAIN_BUTTON_HEIGHT, borderRadius: MAIN_BUTTON_RADIUS, paddingHorizontal: 28 },
  disabled: {
    opacity: 0.5,
  },
  pillText: { fontSize: BUTTON_FONT_SIZE, fontWeight: '600' },
  mainText: { fontSize: MAIN_BUTTON_FONT_SIZE, fontWeight: '600' },
});
