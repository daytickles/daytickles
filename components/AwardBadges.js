// components/AwardBadges.js
//
// The public High Five badge: one hand icon per distinct award type an
// entry has received, from any giver, each coloured per that type. Shown
// to everyone, on any awarded post, including the owner's own. It
// deliberately reveals which type(s) were given (2026-08-29 product
// decision) -- see AWARD_BADGE_COLOR in lib/theme.js for why EntryCard's
// stripe/wash stays generic while this icon doesn't. Each icon is
// independently tappable: tapping one reveals only THAT type's phrase,
// never a combined list, and never who gave it (awarded_entries --
// migration 0054 -- never exposes giver identity, same privacy boundary
// here). Tap again to close; it also closes itself after 2 s (same shape
// as Home's stat-pill tooltips).
//
// Extracted from EntryCard so Weekly Summary's Most liked card can show
// the same badge. Each icon is its own touchable, so tapping it never
// triggers a touchable card it sits inside.
//
// types: distinct award type ids. Unknown types (one added by a newer
// build) are skipped rather than crashing on .color. Renders nothing for
// an empty list. tooltipAlign: 'right' (default) nudges the popup left of
// the icon, for badges near a card's right edge; 'left' opens it to the
// right, for badges near a left edge.

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, AWARD_TYPES, AWARD_HAND_ICON, awardLabelFor } from '../lib/theme';

export default function AwardBadges({ types, size = 16, tooltipAlign = 'right', style }) {
  const [openType, setOpenType] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function showTooltip(type) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (openType === type) {
      setOpenType(null);
      return;
    }
    setOpenType(type);
    timerRef.current = setTimeout(() => setOpenType(null), 2000);
  }

  if (!types?.length) return null;

  return (
    <View style={[styles.row, style]}>
      {types.filter((type) => AWARD_TYPES[type]).map((type) => (
        <View key={type} style={styles.iconWrap}>
          <TouchableOpacity
            onPress={() => showTooltip(type)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`High Five: ${awardLabelFor(type)}`}
          >
            <Ionicons name={AWARD_HAND_ICON} size={size} color={AWARD_TYPES[type]?.color} />
          </TouchableOpacity>
          {openType === type && (
            <View
              style={[styles.tooltip, tooltipAlign === 'left' ? styles.tooltipLeft : styles.tooltipRight]}
              pointerEvents="none"
            >
              <Text style={styles.tooltipText}>{awardLabelFor(type)}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconWrap: { position: 'relative' },
  // Pops upward from the icon (same direction as Home's own stat-pill
  // tooltip). The default (tooltipRight) is nudged left via the negative
  // `right` offset so it has a better chance of staying on-card for the
  // rightmost icon in a multi-type badge, which sits closest to the
  // card's own right edge -- a first-pass placement with no real
  // viewport-edge measurement behind it; retune if it clips on a real
  // device.
  tooltip: {
    position: 'absolute', bottom: '100%', marginBottom: 6,
    width: 170,
  },
  tooltipRight: { right: -20, alignItems: 'center' },
  tooltipLeft: { left: -4, alignItems: 'flex-start' },
  tooltipText: {
    fontSize: 11, fontWeight: '600', color: C.bg, textAlign: 'center',
    backgroundColor: C.rustDark, borderRadius: 8, overflow: 'hidden',
    paddingVertical: 4, paddingHorizontal: 10,
  },
});
