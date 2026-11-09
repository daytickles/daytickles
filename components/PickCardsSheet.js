// components/PickCardsSheet.js
//
// The Pick your cards sheet, opened from Home's Pick your cards card (a
// new account, home_cards still null) or from the No cards on Home box.
// A bottom sheet in a transparent Modal: one row per Home card
// (lib/homeCards.js HOME_CARD_ROWS, deck order) with a stripe in that
// card's colour from the user's Home colours, its name and description,
// and a switch. The switches start from the saved choice (all off while
// nothing is chosen). Done saves profiles.home_cards (homeCardsValue,
// '' for none), refreshes the profile and closes; a failed save keeps
// the sheet open with a message. Back, or a tap on the dimmed area,
// closes without saving. Slides up, or just appears with reduce motion.
import { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, AccessibilityInfo, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useHomePalette } from '../lib/homePalette';
import { HOME_CARD_ROWS, homeCardsFor, homeCardsValue } from '../lib/homeCards';

const INK = '#4A1F10';
const ON_INK = '#FFF8EC';
const SHEET = '#FBF3E7';
const BODY = '#5F5B52';
const DESCRIPTION = '#6B675E';
// The deck colour each row's stripe uses: Polaroids sent and Your
// trackers wear the Blogbits and My Rewards colours, as on Home.
const STRIPE_SLOT = { polaroids: 'multickles', trackers: 'rewards' };

function doneLabel(count) {
  if (count === 0) return 'Done, no cards';
  if (count === 1) return 'Done, show 1 card';
  return `Done, show ${count} cards`;
}

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduceMotion(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduceMotion;
}

// A 48 x 28 switch (on #2F5655, off #B9AE9C, cream knob) in a 48dp-tall
// target, read by TalkBack as a switch.
function CardSwitch({ value, onChange, label, disabled }) {
  return (
    <TouchableOpacity
      style={styles.switchTarget}
      onPress={() => onChange(!value)}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
    >
      <View style={[styles.switchTrack, { backgroundColor: value ? '#2F5655' : '#B9AE9C' }]}>
        <View style={[styles.switchKnob, value ? styles.switchKnobOn : styles.switchKnobOff]} />
      </View>
    </TouchableOpacity>
  );
}

export default function PickCardsSheet({ visible, onClose }) {
  const { session, profile, refreshProfile } = useAuth();
  const { deck } = useHomePalette();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [picks, setPicks] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Each time it opens: the saved choice (all off while not chosen).
  useEffect(() => {
    if (!visible) return;
    setPicks(homeCardsFor(profile));
    setMessage('');
    setSaving(false);
    // Only on opening; a profile refresh while open mustn't undo taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function close() {
    if (saving) return;
    onClose();
  }

  async function handleDone() {
    if (!session || saving) return;
    setSaving(true);
    setMessage('');
    const { error } = await supabase
      .from('profiles')
      .update({ home_cards: homeCardsValue(picks) })
      .eq('id', session.user.id);
    if (error) {
      setSaving(false);
      setMessage("Couldn't save that. Please try again.");
      return;
    }
    await refreshProfile();
    setSaving(false);
    onClose();
  }

  const count = HOME_CARD_ROWS.filter((row) => picks[row.key]).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.dimArea}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close without saving"
        />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">Pick your cards</Text>
          <Text style={styles.intro}>
            Tick the ones you want on Home. A card only shows or hides. You can change this later in Settings.
          </Text>
          <ScrollView style={styles.listScroll} contentContainerStyle={styles.listBox}>
            {HOME_CARD_ROWS.map((row, i) => {
              const on = !!picks[row.key];
              const stripe = deck[STRIPE_SLOT[row.key] || row.key];
              return (
                <View key={row.key} style={[styles.row, i > 0 && styles.rowLine]}>
                  <View style={[styles.stripe, { backgroundColor: stripe, opacity: on ? 1 : 0.3 }]} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{row.name}</Text>
                    <Text style={styles.rowDescription}>{row.description}</Text>
                  </View>
                  <CardSwitch
                    value={on}
                    onChange={(value) => setPicks((prev) => ({ ...prev, [row.key]: value }))}
                    disabled={saving}
                    label={`${row.name} card on Home: ${row.description}`}
                  />
                </View>
              );
            })}
          </ScrollView>
          {!!message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
          <TouchableOpacity
            style={[styles.doneButton, saving && styles.doneSaving]}
            onPress={handleDone}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={doneLabel(count)}
          >
            <Text style={styles.doneText}>{doneLabel(count)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,12,6,0.45)', justifyContent: 'flex-end' },
  // Fills everything above the sheet, so a tap there closes it.
  dimArea: { flex: 1 },
  sheet: {
    // At most most of the screen: the list scrolls, Done stays in view.
    maxHeight: '90%',
    backgroundColor: SHEET,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingTop: 10, paddingHorizontal: 20,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#C9BFAE', marginBottom: 12 },
  title: { fontSize: 22, lineHeight: 27, fontWeight: '700', color: INK },
  intro: { fontSize: 14, lineHeight: 20, color: BODY, marginTop: 4, marginBottom: 14 },
  listScroll: { flexShrink: 1 },
  listBox: {
    backgroundColor: '#FFFDF7', borderWidth: 1, borderColor: '#E8DCC8', borderRadius: 18,
    paddingHorizontal: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 54, gap: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: '#EFE4D1' },
  stripe: { width: 14, height: 32, borderRadius: 7 },
  rowText: { flex: 1, paddingVertical: 8 },
  rowName: { fontSize: 15.5, fontWeight: '600', color: INK },
  rowDescription: { fontSize: 12.5, color: DESCRIPTION, marginTop: 1 },
  switchTarget: { height: 48, justifyContent: 'center' },
  switchTrack: { width: 48, height: 28, borderRadius: 14, justifyContent: 'center' },
  switchKnob: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFDF7' },
  switchKnobOn: { right: 3 },
  switchKnobOff: { left: 3 },
  message: { color: '#B3392C', textAlign: 'center', marginTop: 12 },
  doneButton: {
    marginTop: 14, height: 50, borderRadius: 25, backgroundColor: INK,
    alignItems: 'center', justifyContent: 'center',
  },
  doneSaving: { opacity: 0.7 },
  doneText: { fontSize: 16, fontWeight: '700', color: ON_INK },
});
