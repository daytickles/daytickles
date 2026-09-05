import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, withAlpha, darken } from '../lib/theme';

// Home card for an unanswered Day Dots prompt (see supabase/migrations/
// 0060 + lib/reminders.js's currentDayDotsPromptDate). Deliberately no
// close/"X" icon like QuickStartCard -- the only two ways to leave this
// card are tapping a dot (onSelectDot) or the no-pressure Skip link
// (onSkip), both of which are genuine answers to "what happened tonight",
// not a generic dismiss. Dots are intentionally unlabeled with no stated
// meaning, all rendered in the account's own accent color -- this
// component doesn't know or care what any dot "means".
export default function DayDotsCard({ accentColor, onSelectDot, onSkip, style }) {
  const dotFill = withAlpha(accentColor, 0.22);
  const dotBorder = darken(accentColor, 0.15);

  return (
    <View style={[styles.card, { borderColor: withAlpha(accentColor, 0.4) }, style]}>
      <Text style={styles.heading}>Day Dots</Text>
      <Text style={styles.subtext}>How was tonight, in one tap?</Text>

      <View style={styles.dotRow}>
        {[0, 1, 2].map((i) => (
          <TouchableOpacity
            key={i}
            style={[styles.dot, { backgroundColor: dotFill, borderColor: dotBorder }]}
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
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    padding: 16, marginBottom: 12, alignItems: 'center',
  },
  heading: { fontSize: 15, fontWeight: '700', color: C.text },
  subtext: { fontSize: 13, color: C.subtext, marginTop: 2, marginBottom: 14 },
  dotRow: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  dot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5 },
  skipText: { fontSize: 13, color: C.subtext, fontWeight: '600' },
});
