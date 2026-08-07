// components/InitialsAvatar.js
//
// Small circular identity marker: first letter of the person's username,
// uppercased, as an outlined ring in their own accent color -- replaces
// the old emoji-picker avatar system. Transparent fill with the letter
// also in the accent color (not a contrast-computed fill/text pair) --
// no need for textOn() here since there's no solid background to read
// against. \p{L} is a Unicode property escape matching "letter" in ANY
// script, not just A-Z, so a legitimate non-English username's first
// character shows normally; only a genuinely non-letter first character
// (emoji, digit, symbol) falls back to '?'. Spreading the trimmed string
// (rather than string[0]) iterates by Unicode code point, so a first
// character outside the BMP is read whole, not as half a surrogate pair.

import { View, Text, StyleSheet } from 'react-native';
import { accentFor } from '../lib/theme';

const LETTER = /\p{L}/u;

export default function InitialsAvatar({ username, accentTheme, size = 28 }) {
  const accent = accentFor(accentTheme);
  const trimmed = username?.trim();
  const firstChar = trimmed ? [...trimmed][0] : undefined;
  const initial = firstChar && LETTER.test(firstChar) ? firstChar.toUpperCase() : '?';

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: accent.card }]}>
      <Text style={[styles.letter, { color: accent.card, fontSize: size * 0.5 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontWeight: '700' },
});
