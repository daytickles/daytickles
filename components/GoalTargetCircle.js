import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';

// This week's Tickle count for a Goal with a weekly target (goals.weekly_target,
// migration 0072). Hollow = neutral, still going; solid with a tick = target
// reached. The tick, not colour alone, carries the reached state, and there's
// deliberately no "missed" or "x of y" look -- hollow is just the default.
//
// The solid fill is C.text rather than teal: teal measured only ~1.5:1 against
// every Goal pill background (withAlpha(goalColor, 0.14) over C.bg), while
// C.text is ~10.6:1+ on all five GOAL_COLORS, and a C.card tick on it ~14:1.
//
// minWidth + paddingHorizontal let a 2-3 digit count grow into a capsule
// instead of clipping, same trick as Home's redeemBalanceCircle.
//
// `accessible={false}` is for use inside a touchable that already speaks for
// the whole thing (Home's Goal pill), so the label isn't read twice.
export default function GoalTargetCircle({ count, target, size = 24, accessible = true }) {
  const reached = count >= target;
  return (
    <View
      style={[
        styles.circle,
        { minWidth: size, height: size, borderRadius: size / 2 },
        reached && styles.circleReached,
      ]}
      accessible={accessible}
      accessibilityLabel={
        accessible
          ? reached ? `${count} this week, target reached` : `${count} of ${target} this week`
          : undefined
      }
    >
      {reached ? (
        <Ionicons name="checkmark" size={Math.round(size * 0.6)} color={C.card} />
      ) : (
        <Text style={styles.count} maxFontSizeMultiplier={1.2}>{count}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    flexShrink: 0, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.text,
  },
  circleReached: { backgroundColor: C.text },
  count: { fontSize: 12, fontWeight: '700', color: C.text },
});
