import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FOUNDING_MEMBER_BADGE_COLOR, textOn } from '../lib/theme';

// FM26-style pill, next to a username wherever one appears. Ionicons
// (used everywhere else in this app) has no crown glyph at all --
// checked the actual glyph map, not just guessed -- so this is the one
// spot that reaches for MaterialCommunityIcons instead, which does
// have "crown", matching the spec's explicit icon choice.
export default function FoundingMemberBadge({ number, style = undefined }) {
  if (!number) return null;
  const textColor = textOn(FOUNDING_MEMBER_BADGE_COLOR);

  return (
    <View style={[styles.badge, { backgroundColor: FOUNDING_MEMBER_BADGE_COLOR }, style]}>
      <MaterialCommunityIcons name="crown" size={11} color={textColor} />
      <Text style={[styles.text, { color: textColor }]}>{`FM${number}`}</Text>
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
