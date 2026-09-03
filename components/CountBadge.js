import { View, Text, StyleSheet } from 'react-native';
import { C } from '../lib/theme';

// Shared small numeric badge -- same visual (color, shape, 9+ cap) CornerNav
// has always used for the notifications bell, extracted so other spots
// (Tickle Stash's Following/Rippled tabs) can reuse it exactly rather than
// re-declaring the same styling and risking the two drifting apart.
// Renders nothing for a falsy count (0, null, undefined) -- callers don't
// need their own conditional.
export default function CountBadge({ count, style }) {
  if (!count) return null;
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.text}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  text: { fontSize: 10, fontWeight: '700', color: C.bg },
});
