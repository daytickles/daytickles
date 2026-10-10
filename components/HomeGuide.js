import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { C, accentFor, darken } from '../lib/theme';
import { useAuth } from '../contexts/AuthContext';
import Button from './Button';

// Content lives here (not passed as props) since both callers — the
// auto-shown first-run guide on Home and the on-demand "How DayTickles
// works" link in Settings — show the exact same steps.
const STEPS = [
  {
    title: 'Home & Your Vibes',
    body: "With every Tickle you write, you can add one of three Vibes — Made me smile, Paying forward, or For me — or make it a My Day Tickle, the fourth kind, for anything else from your day.\n\nThe three Vibe cards on Home show your activity by week, month, and all-time. You can also set daily and weekly targets for any Vibe in Settings — each has its own lightbulb on the Vibe card, lighting up once you hit that target for the day or the week. It is completely optional — a little extra motivation if you like having something to aim for.",
  },
  {
    title: 'More on Home',
    body: "Below the Vibe cards, the Mojo Shared pills track your polaroid shares and Ripples the same way — this week, this month, and all-time. Tap a pill to see exactly what it's counting.\n\nFurther down, Remember this? shows up to three older Tickles to revisit — tap one to open it. Your Goals shows how many Tickles you've tagged to each active Goal — tap one to see them all. When you have enough tokens for a reward, You can redeem shows which ones — tap a reward to open your Reward List. Multickles you follow lists the ones that are still going, with a small sparkle on any that have a Tic you haven't seen yet.",
  },
  {
    title: 'New Tickle',
    body: "Tap New Tickle to capture something from your day. Write what's on your mind, then pick a Vibe — Made me smile, Paying forward, or For me — or choose My Day, its sun icon, for anything else from your day. Its icon becomes that entry's identifier everywhere it shows up: Tickle Stash, Calendar, and Home.\n\nYou decide whether your Tickle stays private or is a post on Rippled.\n\nMy Day entries live under 'Mine' on the Tickle Stash — in All with everything else, or on their own under My Day.",
  },
  {
    title: 'Tickle Stash',
    body: "The Tickle Stash has four tabs: Mine, Fav's, Following, and Rippled. Under Mine, a row of Goal Pills lets you filter at a glance — tap one to see every entry tagged to that Goal.\n\nLike a Tickle with the thumbs-up, or save it to your favourites with the star.\n\nOnce you've favourited a Tickle, you can give it recognition with a High Five: LOL, Well said!, Awesome!, Feeling it!, Made my day! or Epic!\n\nUse the three-dot menu on your own Tickles for Edit, Share or Delete, and — once a Tickle is Rippled — to add it to a Multickle. To make a Tickle public, use the Ripple / Un-Ripple label on the card instead.",
  },
  {
    title: 'Multickles',
    body: "Turn a string of Rippled Tickles into a Multickle — a named, ongoing story other users can recognise and follow as it unfolds. Start one from Manage Multickles in Settings, then add Tics by tagging any Rippled Tickle to it from its three-dot menu.\n\nEach Tic carries a small Multickle chip, on Tickle Stash and Calendar, showing its place in the story. Tap it to open the Multickle and see every Tic in order, plus a Follow button of its own — separate from following the author.\n\nMark a Multickle Complete once its story is finished. No new Tics can be added after that, but everything already there stays exactly as it is.",
  },
  {
    title: 'Calendar',
    body: "Calendar marks every day you've written a Tickle with its Vibe icon, so you can see your rhythm at a glance. Days with a Goal-tagged entry also show a colored dot for that Goal. Tap any day to see what you wrote.\n\nSwitch to the Day Dots tab to see your daily check-ins over time — how was your day, at a glance, going back through your history.",
  },
  {
    title: 'Tickle Pics',
    body: 'Tickle Pics is where your meaningful photos live. Pin a photo to an entry, or share it instantly as a polaroid tagged as either "This made me smile today" or "I saw this and thought of you." Tap a Vibe icon on any photo to instantly create a private Tickle from it — no writing required.\n\nYour privacy comes first. Photos stay on your device unless you Ripple a Tickle that has one — then that photo is shared with it, and Un-Ripple or delete removes the shared copy. Use Backup & Restore Photos in Settings to keep a copy safe, or bring your photos along when you switch devices.',
  },
  {
    title: 'Goals',
    body: "Manage your Goals from Settings. Use them for anything you're focusing on, then tag Tickles to a Goal by tapping the empty circle on the entry. This is an easy, private way to record your progress. Mark a Goal as Achieved or delete it whenever you like.\n\nIf you like, give a Goal a weekly target. Its pill on Home then shows this week's count in a small circle, which fills with a tick once you get there — and if you don't, that's fine too.\n\nToggle on 'Earn tokens' for any Goal to collect a token each time you tag a Tickle to it. Spend tokens on rewards you set up yourself, from Manage Reward List in Settings.",
  },
  {
    title: 'Awareness Cue',
    body: "Awareness Cue is a private, contentless vibration or sound burst that fires a few times a day, at random moments — a personal nudge to notice what's happening right now. No message, no response expected.\n\nTurn it on in Settings, then choose Vibrate or Sound, how often (Surprise me, or an exact count from 1 to 10 a day), and the hours it's allowed to fire in.",
  },
  {
    title: 'Moji Quest',
    body: "Tap the crown — in the top bar on any tab — to see your Moji Quest invite. Opting in starts your 6-month Quest — the clock doesn't start until you do, and missing the opt-in window closes the opportunity for good. Complete the Quest and you'll become a Mojician: lifetime membership and your own unique Moji ID.",
  },
  {
    title: 'Weekly Summary',
    body: "Tap the chart icon — in the top bar on any tab — to open your Weekly Summary: a look back at your week, including your most-liked Tickle, Weekly Vibes, Goals you've achieved, connections you've made, High Fives given and received, and your Tickle Pics activity.",
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
      {/* Same structure as AboutModal: the tap-outside-to-close layer is a
          sibling behind the sheet, not its parent, so nothing touchable
          wraps the ScrollView and a vertical drag on the text scrolls. The
          sheet is capped at 85% and only the title + body scroll; Skip,
          the dots and Back/Next stay fixed and always visible. */}
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          {/* key={index}: each step starts scrolled to its top. */}
          <ScrollView
            key={index}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            persistentScrollbar
          >
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>
          </ScrollView>

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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    width: '100%', maxHeight: '85%', backgroundColor: C.card, borderRadius: 18, padding: 20,
  },
  skip: { alignSelf: 'flex-end', marginBottom: 8 },
  skipText: { fontSize: 14, fontWeight: '600', color: C.subtext },

  // flexShrink lets the scroll area give way inside the 85% sheet, so the
  // fixed parts below never get pushed off. Its marginBottom is the body's
  // old 20dp gap above the dots.
  scroll: { flexShrink: 1, marginBottom: 20 },
  scrollContent: { paddingBottom: 4 },
  stepTitle: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginBottom: 10 },
  stepBody: { fontSize: 15, color: C.text, lineHeight: 21 },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.faint },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  navSpacer: { flex: 1 },
});
