import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { C } from '../lib/theme';
import Button from './Button';

// Content lives here (not passed as props) since both callers — the
// auto-shown first-run guide on Home and the on-demand "How DayTickles
// works" link in Settings — show the exact same four steps.
const STEPS = [
  {
    title: 'Your Smile Streak',
    body: "The number at the top of Home is your smile streak — consecutive days with at least one tickle logged. Right below it, the two stat cards track your all-time total tickles and total likes received.",
  },
  {
    title: 'New Tickle',
    body: 'Tap "New Tickle" to log what made you smile today. Pick a mood from a hint of a smile to a big grin — it drives the color and motion of your entry\'s animation.',
  },
  {
    title: 'The Feed',
    body: "The Feed screen has four tabs: Everyone, Following, Mine, and Fav's. The sparkle icon on any entry is how you like it — tap it to like, tap again to unlike.",
  },
  {
    title: 'Goals & Notifications',
    body: "Tap the dot next to an entry to tag it with a goal, so you can notice patterns over time. The bell icon on Home lets you know when someone likes your tickles.",
  },
];

export default function HomeGuide({ visible, onClose }) {
  const [index, setIndex] = useState(0);

  // Reopening (e.g. from Settings, after having seen it before) always
  // starts back at step 1 rather than resuming wherever it was left.
  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  function handleNext() {
    if (isLast) onClose();
    else setIndex((i) => i + 1);
  }

  function handleBack() {
    setIndex((i) => Math.max(0, i - 1));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.stepBody}>{step.body}</Text>

          <View style={styles.dotsRow}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.navRow}>
            {index > 0 ? (
              <Button title="Back" variant="secondary" onPress={handleBack} />
            ) : (
              <View style={styles.navSpacer} />
            )}
            <Button title={isLast ? 'Done' : 'Next'} variant="primary" onPress={handleNext} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    width: '100%', backgroundColor: C.card, borderRadius: 18, padding: 20,
  },
  skip: { alignSelf: 'flex-end', marginBottom: 8 },
  skipText: { fontSize: 14, fontWeight: '600', color: C.subtext },

  stepTitle: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginBottom: 10 },
  stepBody: { fontSize: 15, color: C.text, lineHeight: 21, marginBottom: 20 },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.faint },
  dotActive: { backgroundColor: C.rust, width: 20 },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  navSpacer: { flex: 1 },
});
