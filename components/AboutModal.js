import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { C } from '../lib/theme';
import Button from './Button';

const FEATURES = [
  'Save the moments that made your day.',
  'Share them if you wish, tagged as "This made me smile today" or "I saw this and thought of you".',
  'Set gentle goals to notice more of the good, find balance where needed.',
  'Discover the moments that made others smile, and smile with them.',
  'Favourite the Tickles that mean the most, and follow people whose moments inspire you.',
  'Revisit your memories anytime through your personal calendar.',
  'Pin photos to a private board on your device, and Tickle about the ones that matter.',
];

// showGuideLink is optional, only passed true by the auto-shown
// new-user context (see home.js) — the normal Settings-opened usage
// doesn't pass it, so the hint never appears there.
export default function AboutModal({ visible, onClose, showGuideLink }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.skip}>
            <Text style={styles.skipText}>Close</Text>
          </TouchableOpacity>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.heading}>Why DayTickles exists</Text>
            <Text style={styles.body}>
              Every day holds a few good moments. Some are tiny, some unforgettable, and some
              simply make you smile. These are the little "tickles" that brighten a day: a kind
              word, a beautiful view, a funny moment or something that reminds you of someone
              special. Too often, they quietly disappear by bedtime.
            </Text>
            <Text style={styles.bodyEmphasis}>DayTickles gives those moments a place to live.</Text>
            <Text style={styles.body}>
              It's not about writing long journal entries or keeping up with another daily habit.
              Just capture the moments that mattered — a quick thought, a few words about what made
              you smile today, or what reminded you of someone special.
            </Text>

            <Text style={styles.body}>With DayTickles, you can:</Text>
            {FEATURES.map((feature, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{feature}</Text>
              </View>
            ))}

            <Text style={styles.heading}>The difference: Intentionally low-pressure.</Text>
            <Text style={styles.body}>
              There are no rules or expectations. Add a Tickle any time, any day — as many or as
              few as you like, or only when something worth remembering happens.
            </Text>
            <Text style={styles.body}>
              The streak on your Home screen isn't there to judge — it's simply there to help you
              notice patterns if they emerge. Miss a day? Nothing happens.
            </Text>

            <Text style={styles.bodyEmphasis}>Your moments. Your pace. Your memories.</Text>
            <Text style={styles.quote}>"Just notice the nice, save it, and share it."</Text>

            {showGuideLink && (
              <Text style={styles.guideHint}>
                You can revisit this anytime, and see "How DayTickles works," from Settings.
              </Text>
            )}
          </ScrollView>

          <View style={styles.navRow}>
            <Button title="Got it" variant="primary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    width: '100%', maxHeight: '80%', backgroundColor: C.card, borderRadius: 18, padding: 20,
  },
  skip: { alignSelf: 'flex-end', marginBottom: 8 },
  skipText: { fontSize: 14, fontWeight: '600', color: C.subtext },

  scroll: { flexShrink: 1, marginBottom: 16 },

  heading: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginTop: 4, marginBottom: 10 },
  body: { fontSize: 15, color: C.text, lineHeight: 21, marginBottom: 12 },
  bodyEmphasis: { fontSize: 15, fontWeight: '700', color: C.rustDark, lineHeight: 21, marginBottom: 12 },
  quote: { fontSize: 15, fontStyle: 'italic', color: C.subtext, lineHeight: 21 },

  bulletRow: { flexDirection: 'row', marginBottom: 8, paddingLeft: 4 },
  bullet: { fontSize: 15, color: C.text, marginRight: 8 },
  bulletText: { flex: 1, fontSize: 15, color: C.text, lineHeight: 21 },

  navRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  guideHint: { fontSize: 13, color: C.subtext, textAlign: 'center', marginTop: 16 },
});
