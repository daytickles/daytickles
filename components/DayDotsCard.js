import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, withAlpha, darken } from '../lib/theme';

// Home card for an unanswered Day Dots prompt (see supabase/migrations/
// 0060 + lib/reminders.js's currentDayDotsPromptDate). Deliberately no
// close/"X" icon like QuickStartCard -- the only two ways to leave this
// card are tapping a dot (onSelectDot) or the no-pressure Skip link
// (onSkip), both of which are genuine answers to "what happened tonight",
// not a generic dismiss. Dots are intentionally unlabeled with no stated
// meaning, all rendered in the account's own accent color -- this
// component doesn't know or care what any dot "means". Three distinct
// sizes (small/medium/large) are the actual visual mechanic here, per
// the original design -- not a cosmetic choice, and still no stated
// meaning attached to which size is which.
//
// availableUntilLabel is a plain pre-formatted string (e.g. "9:00 PM"),
// computed once by the caller (see app/(tabs)/home.js's checkNow()) --
// deliberately not a live countdown here. A shrinking number reads as
// pressure/urgency, which conflicts with this app's no-guilt design
// elsewhere; a static "available until" line gives the same useful
// information without it.
//
// Plain card container (backgroundColor/borderRadius/padding/marginBottom),
// matching Home's other plain content cards (see entryCard in
// app/(tabs)/home.js) rather than a bespoke bordered/tinted treatment --
// no card on Home uses a shadow/elevation either, so this doesn't.
const DOT_SIZES = [26, 36, 46];

export default function DayDotsCard({ accentColor, availableUntilLabel, onSelectDot, onSkip, style }) {
  const dotFill = withAlpha(accentColor, 0.22);
  const dotBorder = darken(accentColor, 0.15);

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.heading}>How was your Day?</Text>
      {!!availableUntilLabel && (
        <Text style={styles.availability}>Available until {availableUntilLabel}</Text>
      )}

      <View style={styles.dotRow}>
        {DOT_SIZES.map((size, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.dot,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: dotFill, borderColor: dotBorder },
            ]}
            onPress={() => onSelectDot(i)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          />
        ))}
      </View>

      <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12,
    alignItems: 'center',
  },
  heading: { fontSize: 15, fontWeight: '700', color: C.text },
  availability: { fontSize: 12, color: C.subtext, marginTop: 2, marginBottom: 10 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 10 },
  dot: { borderWidth: 1.5 },
  skipText: { fontSize: 13, color: C.subtext, fontWeight: '600' },
});
