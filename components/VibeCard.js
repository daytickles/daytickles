import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { textOn, withAlpha, lighten } from '../lib/theme';
import NatureIcon from './NatureIcon';

// Home Vibes redesign — one card per nature category. Deliberately no
// text labels inside the card (week/month/all-time read by position,
// top to bottom, largest/most prominent on top per the spec) — the
// vibe's own label sits below the card, passed in and rendered by the
// caller, not by this component.
export default function VibeCard({
  nature,
  color,
  lit,
  accentColor,
  weekCount,
  monthCount,
  allTimeCount,
}) {
  const textColor = textOn(color);
  const dividerColor = withAlpha(textColor, 0.25);
  // Same formula as Home's old streak-card sunburst (streakSunburstColor,
  // removed during this redesign) -- lightened 50% toward white, 40%
  // alpha -- but derived from this card's OWN color, not the user's
  // accent theme. The spec's "explicitly rejected placements" ruled out
  // an ACCENT-colored dot here (real clash risk against a similarly-
  // hued vibe card); a same-color dot can't clash with itself, so this
  // is a different case, not a reintroduction of that one.
  const cornerDotColor = withAlpha(lighten(color, 0.5), 0.4);

  return (
    <View style={styles.wrap}>
      <Ionicons
        name={lit ? 'bulb' : 'bulb-outline'}
        size={20}
        color={lit ? accentColor : '#B4B2A9'}
        style={styles.bulb}
      />
      <View style={[styles.card, { backgroundColor: color }]}>
        <View style={[styles.cornerDot, { backgroundColor: cornerDotColor }]} />
        <NatureIcon nature={nature} size={14} color={withAlpha(textColor, 0.55)} style={styles.natureIcon} />
        <Text style={[styles.weekNumber, { color: textColor }]}>{weekCount}</Text>
        <View style={[styles.divider, { backgroundColor: dividerColor }]} />
        <Text style={[styles.monthNumber, { color: textColor }]}>{monthCount}</Text>
        <View style={[styles.divider, { backgroundColor: dividerColor }]} />
        <Text style={[styles.allTimeNumber, { color: textColor }]}>{allTimeCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center' },
  bulb: { marginBottom: 6 },
  card: {
    width: '100%', borderRadius: 18, overflow: 'hidden',
    paddingTop: 10, paddingBottom: 12, alignItems: 'center',
  },
  // Offset scales with size (both doubled together here) so the dot
  // keeps the same "peeking from the corner" proportion rather than
  // just growing in place -- same ~1/3-of-diameter offset ratio the
  // old streak-card sunburst used (30/90).
  cornerDot: {
    position: 'absolute', top: -36, right: -36,
    width: 112, height: 112, borderRadius: 56,
  },
  natureIcon: { marginBottom: 4 },
  weekNumber: { fontSize: 24, fontWeight: 'bold', lineHeight: 28 },
  monthNumber: { fontSize: 17, fontWeight: '700', lineHeight: 21 },
  allTimeNumber: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  divider: { width: 28, height: 1, marginVertical: 4 },
});
