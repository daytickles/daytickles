import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, withAlpha } from '../lib/theme';

// Persistent onboarding card on Home -- see quick_start_dismissed
// (migration 0038). Plain text bullets; the crown/Settings references
// point at existing UI elsewhere (CornerNav's crown icon, the Settings
// tab) rather than duplicating navigation here, so this component
// stays a single dismiss action.
const BULLETS = [
  "Write about something that made you smile, someone you helped, or Me-time moments — that's a Tickle. It's private by default; you choose if and when to share.",
  'Curious about daily targets or personalizing your experience? All in Settings, anytime — no rush.',
  "Thinking long-term? Tap the crown to see what Founding Member's about.",
  'Want more on how it all works? See Settings.',
];

export default function QuickStartCard({ onDismiss, style }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Quick start</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={16} color={C.sparkleText} />
        </TouchableOpacity>
      </View>

      {BULLETS.map((text, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.sparkleBg, borderRadius: 16, borderWidth: 1,
    borderColor: withAlpha(C.sparkleText, 0.25),
    padding: 16, marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  heading: { fontSize: 15, fontWeight: '700', color: C.sparkleText },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bulletDot: { fontSize: 14, color: C.sparkleText, marginRight: 8, lineHeight: 19 },
  bulletText: { flex: 1, fontSize: 13, color: C.sparkleText, lineHeight: 19 },
});
