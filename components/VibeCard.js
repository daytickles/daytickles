import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, textOn, withAlpha, NATURE_LABELS } from '../lib/theme';
import NatureIcon from './NatureIcon';

// Same explainer for every card, tap-triggered -- the three numbers'
// meaning is positional (left to right), not per-vibe, so one shared
// string covers all three.
const TOOLTIP_TEXT = 'This week | this month | all time';

// Home Vibes card, compact version (Task 3 H1): 72dp tall, one line of
// numbers. Deliberately no text labels inside the card -- the vibe's own
// label sits below the card, rendered by the caller. The two bulbs above
// the card are unchanged.
export default function VibeCard({
  nature,
  color,
  textColor: textColorProp,
  lit,
  litWeekly,
  accentColor,
  weekCount,
  monthCount,
  allTimeCount,
  showTooltip,
  onPress,
}) {
  // A palette can fix the text colour (VIBE_CARD_PALETTES in
  // lib/theme.js); otherwise it's worked out from the card colour.
  const textColor = textColorProp || textOn(color);

  return (
    <TouchableOpacity
      style={styles.wrap}
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${NATURE_LABELS[nature]}: ${weekCount} this week, ${monthCount} this month, ${allTimeCount} all time`}
    >
      <View style={styles.bulbRow}>
        <Ionicons
          name={lit ? 'bulb' : 'bulb-outline'}
          size={20}
          color={lit ? accentColor : C.faint}
        />
        <Ionicons
          name={litWeekly ? 'bulb' : 'bulb-outline'}
          size={20}
          color={litWeekly ? accentColor : C.faint}
        />
      </View>
      {/* Soft shadow tinted with the card's own colour. No overflow:
          'hidden' any more (the corner circle it clipped is gone), so the
          tooltip below could sit inside -- kept as a sibling anyway. */}
      <View style={[styles.card, { backgroundColor: color, shadowColor: color }]}>
        <View style={[styles.iconCircle, { backgroundColor: withAlpha(textColor, 0.18) }]}>
          <NatureIcon nature={nature} size={15} color={textColor} />
        </View>
        {/* One line, never wrapped or clipped: with 3-digit numbers (or a
            large font scale) the whole line shrinks to fit the card's
            width. The card's height is a minimum, so a taller line at a
            large font scale grows the card instead of clipping it. */}
        <Text
          style={[styles.numbersLine, { color: textColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.3}
        >
          <Text style={styles.weekNumber}>{weekCount}</Text>
          <Text style={[styles.separator, { color: withAlpha(textColor, 0.55) }]}>{' | '}</Text>
          <Text style={styles.monthNumber}>{monthCount}</Text>
          <Text style={[styles.separator, { color: withAlpha(textColor, 0.55) }]}>{' | '}</Text>
          <Text style={styles.allTimeNumber}>{allTimeCount}</Text>
        </Text>
      </View>
      {showTooltip && (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipText}>{TOOLTIP_TEXT}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center' },
  bulbRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  card: {
    width: '100%', minHeight: 72, borderRadius: 24,
    paddingVertical: 8, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center', gap: 4,
    // shadowColor is the card colour (inline). Android 9+ uses it with
    // elevation; older Android shows a plain grey elevation shadow.
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },
  iconCircle: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  numbersLine: { textAlign: 'center', alignSelf: 'stretch' },
  weekNumber: { fontSize: 22, fontWeight: '700' },
  monthNumber: { fontSize: 16, fontWeight: '600' },
  allTimeNumber: { fontSize: 15, fontWeight: '500' },
  separator: { fontSize: 15, fontWeight: '400' },
  // Same visual treatment as home.js's own statTooltip/statTooltipText
  // (Tickles/Likes/Shares pills) -- kept as a separate copy here since
  // this is a different file/component, matching this app's existing
  // per-file style-duplication convention (e.g. NATURE_LABELS).
  tooltip: {
    position: 'absolute', top: -34, left: -20, right: -20,
    alignItems: 'center',
  },
  tooltipText: {
    fontSize: 11, fontWeight: '600', color: C.bg, textAlign: 'center',
    backgroundColor: C.rustDark, borderRadius: 8, overflow: 'hidden',
    paddingVertical: 4, paddingHorizontal: 10,
  },
});
