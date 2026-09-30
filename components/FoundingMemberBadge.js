import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FOUNDING_MEMBER_BADGE_COLOR, textOn } from '../lib/theme';

// FM26-style pill, next to a username wherever one appears. Ionicons
// (used everywhere else in this app) has no crown glyph at all --
// checked the actual glyph map, not just guessed -- so this is the one
// spot that reaches for MaterialCommunityIcons instead, which does
// have "crown", matching the spec's explicit icon choice.
//
// compact drops the "MOJI" prefix (crown + number only) -- used on
// EntryCard's header row, where username + flag + badge + Ripple/star/
// menu already share one line and the full "MOJI25" pill squeezed the
// username down to "…" on 360dp screens. Home's own name row has room
// for the full text, so it keeps the default.
export default function FoundingMemberBadge({ number, compact = false, style = undefined }) {
  if (!number) return null;
  const textColor = textOn(FOUNDING_MEMBER_BADGE_COLOR);

  return (
    <View style={[styles.badge, { backgroundColor: FOUNDING_MEMBER_BADGE_COLOR }, style]}>
      <MaterialCommunityIcons name="crown" size={11} color={textColor} />
      <Text style={[styles.text, { color: textColor }]}>{compact ? `${number}` : `MOJI${number}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  text: { fontSize: 10, fontWeight: '700' },
});
