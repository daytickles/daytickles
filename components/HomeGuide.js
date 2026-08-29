import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { C, accentFor, darken } from '../lib/theme';
import { useAuth } from '../contexts/AuthContext';
import Button from './Button';

// Content lives here (not passed as props) since both callers — the
// auto-shown first-run guide on Home and the on-demand "How DayTickles
// works" link in Settings — show the exact same eight steps.
const STEPS = [
  {
    title: 'Home & Your Vibes',
    body: "Every Tickle you write gets a Vibe — Made me smile, I paid forward, or For me. Choose one when you save your entry.\n\nThe three Vibe cards on Home show your activity by week, month, and all-time. You can also set daily and weekly targets for any Vibe in Settings — each has its own lightbulb on the Vibe card, lighting up once you hit that target for the day or the week. It is completely optional — a little extra motivation if you like having something to aim for.",
  },
  {
    title: 'New Tickle',
    body: "Tap New Tickle to capture something from your day. Write what's on your mind, then pick your Vibe — Made me smile, I paid forward, or For me. Its icon becomes that entry's identifier everywhere it shows up: Tickle Stash, Calendar, and Home.\n\nYou decide whether your Tickle stays private or is a post on Rippled.\n\nA Day Journal is available in Settings if you want more space for personal, in-depth writing. You will find your Journal under 'Mine' on the Tickle Stash.",
  },
  {
    title: 'Tickle Stash',
    body: "The Tickle Stash has four tabs: Mine, Fav's, Following, and Rippled.\n\nLike a Tickle with the thumbs-up, or save it to your favourites with the star.\n\nOnce you've favourited a Tickle, you can give it recognition with one of three High Fives:\n\nWordweaver — beautifully written\nSoulweaver — emotionally moving\nWittweaver — funny and clever\n\nUse the three-dot menu on your own Tickles to Edit, Make public, or Delete.",
  },
  {
    title: 'Calendar',
    body: "Calendar marks every day you've written a Tickle with its Vibe icon, so you can see your rhythm at a glance. Days with a Goal-tagged entry also show a colored dot for that Goal. Tap any day to see what you wrote.",
  },
  {
    title: 'Tickle Pics',
    body: 'Tickle Pics is where your meaningful photos live. Pin a photo to an entry, or share it instantly as a polaroid tagged as either "This made me smile today" or "I saw this and thought of you."\n\nYour privacy comes first. Photos taken through the app are kept only on your device — they are never uploaded to or stored in our database. To keep a photo outside the app, simply download it to your device.',
  },
  {
    title: 'Goals',
    body: "Manage your Goals from Settings. Use them for anything you're focusing on, then tag Tickles to a Goal by tapping the empty circle on the entry. This is an easy, private way to record your progress. Goals can be archived or deleted whenever you like.",
  },
  {
    title: 'Founding Member',
    body: "Tap the crown to see your Founding Member invite. Opting in starts your 6-month Quest — the clock doesn't start until you do, and missing the opt-in window closes the opportunity for good. Complete the Quest and you'll receive lifetime membership and your own unique Founding Member ID.",
  },
  {
    title: 'Weekly Summary',
    body: "Tap the chart icon on Home to open your Weekly Summary — a look back at your week, including your most-liked Tickle, Weekly Vibes, Goals you've achieved, connections you've made, High Fives given and received, and your Tickle Pics activity.",
  },
];

export default function HomeGuide({ visible, onClose }) {
  const { profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
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
              <View
                key={i}
                style={[styles.dot, i === index && { backgroundColor: accentDark, width: 20 }]}
              />
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

  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  navSpacer: { flex: 1 },
});
