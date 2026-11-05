import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { C, accentFor, darken, withAlpha } from '../../lib/theme';
import { localDateString, parseLocalDateString, toLocalDateString } from '../../lib/week';
import { RNR_SLOTS, RNR_SLOT_LABELS } from '../../lib/rnrs';
import { useRnrDay } from '../../lib/useRnrDay';
import { BUTTON_HEIGHT, BUTTON_HIT_SLOP, BUTTON_RADIUS } from '../../lib/buttonSize';
import CornerNav from '../../components/CornerNav';
import WallpaperBackground from '../../components/WallpaperBackground';
import RnrTile from '../../components/RnrTile';
import RnrMoveChooser from '../../components/RnrMoveChooser';
import RnrDayPicker from '../../components/RnrDayPicker';
import RnrAddPicker from '../../components/RnrAddPicker';

// Routines and Reminders, the full page: plan small things for Morning,
// Afternoon and Evening of any day (Today by default), and mark them
// Done, Skip or Move to. Reached from the today pop-up's "Open Routines
// and Reminders" button. Past days show what was planned as it is -- no
// warning or catch-up wording.
export default function RnrsPage() {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [planDate, setPlanDate] = useState(() => localDateString());
  const day = useRnrDay(userId, planDate);
  const [moving, setMoving] = useState(null);
  const [dayPickerFor, setDayPickerFor] = useState(null);
  const [addSlot, setAddSlot] = useState(null);

  // Fresh on every visit (the pop-up may have changed today's tiles).
  const { reload } = day;
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const today = localDateString();
  const isToday = planDate === today;
  const dayTitle = dayName(planDate, today);
  const dateLine = parseLocalDateString(planDate).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  function shiftDay(delta) {
    const d = parseLocalDateString(planDate);
    d.setDate(d.getDate() + delta);
    setPlanDate(toLocalDateString(d));
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.navigate('/home');
  }

  async function handleAdd(choice) {
    const slot = addSlot;
    setAddSlot(null);
    await day.add(slot, choice);
  }

  return (
    <>
      <WallpaperBackground>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: styles.content.paddingBottom + tabBarHeight },
          ]}
        >
          <CornerNav />

          <View style={styles.titleRow}>
            <TouchableOpacity
              onPress={goBack}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={24} color={C.subtext} />
            </TouchableOpacity>
            <Text style={styles.title} accessibilityRole="header">Routines and Reminders</Text>
          </View>
          <Text style={styles.subtitle}>Plan a few small things for each part of your day.</Text>

          <View style={styles.dayRow}>
            <TouchableOpacity
              onPress={() => shiftDay(-1)}
              style={styles.dayNav}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Ionicons name="chevron-back" size={22} color={C.subtext} />
            </TouchableOpacity>
            <View style={styles.dayLabelWrap} accessible accessibilityLabel={isToday ? `Today, ${dateLine}` : dateLine}>
              <Text style={styles.dayTitle}>{dayTitle}</Text>
              {dayTitle !== dateLine && <Text style={styles.dayDate}>{dateLine}</Text>}
            </View>
            <TouchableOpacity
              onPress={() => shiftDay(1)}
              style={styles.dayNav}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Ionicons name="chevron-forward" size={22} color={C.subtext} />
            </TouchableOpacity>
          </View>
          {!isToday && (
            <TouchableOpacity
              onPress={() => setPlanDate(today)}
              style={styles.backToToday}
              accessibilityRole="button"
              accessibilityLabel="Back to today"
            >
              <Text style={[styles.backToTodayText, { color: accentDark }]}>Back to today</Text>
            </TouchableOpacity>
          )}

          {day.loading && day.placements.length === 0 && <ActivityIndicator color={C.rust} style={styles.loader} />}
          {!day.loading && day.loadError && (
            <Text style={styles.errorText}>Couldn't load your tiles — please try again later.</Text>
          )}

          {!day.loadError && RNR_SLOTS.map((s) => {
            const tiles = day.placements.filter((p) => p.slot === s);
            return (
              <View key={s} style={styles.slot}>
                <Text style={styles.slotLabel} accessibilityRole="header">{RNR_SLOT_LABELS[s]}</Text>
                {tiles.map((p) => (
                  <RnrTile
                    key={p.id}
                    placement={p}
                    accentDark={accentDark}
                    onSetStatus={day.setStatus}
                    onMoveTo={setMoving}
                    onMoveSlot={(pl, slot) => day.move(pl, { slot })}
                  />
                ))}
                <TouchableOpacity
                  onPress={() => setAddSlot(s)}
                  hitSlop={BUTTON_HIT_SLOP}
                  style={styles.addPill}
                  accessibilityRole="button"
                  accessibilityLabel={`Add a tile to ${RNR_SLOT_LABELS[s]}`}
                >
                  <Ionicons name="add" size={16} color={accentDark} />
                  <Text style={[styles.addText, { color: accentDark }]}>Add</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </WallpaperBackground>

      <RnrMoveChooser
        placement={moving}
        onPickSlot={(slot) => {
          const p = moving;
          setMoving(null);
          day.move(p, { slot });
        }}
        onAnotherDay={() => {
          setDayPickerFor(moving);
          setMoving(null);
        }}
        onClose={() => setMoving(null)}
      />
      <RnrDayPicker
        visible={!!dayPickerFor}
        currentDate={planDate}
        onPick={(dateStr) => {
          const p = dayPickerFor;
          setDayPickerFor(null);
          day.move(p, { planDate: dateStr });
        }}
        onClose={() => setDayPickerFor(null)}
      />
      <RnrAddPicker slot={addSlot} onAdd={handleAdd} onClose={() => setAddSlot(null)} />
    </>
  );
}

// "Today", "Yesterday", "Tomorrow", or the full date.
function dayName(planDate, today) {
  if (planDate === today) return 'Today';
  const t = parseLocalDateString(today);
  const diff = Math.round((parseLocalDateString(planDate) - t) / 86400000);
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return parseLocalDateString(planDate).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  subtitle: { fontSize: 14, color: C.subtext, lineHeight: 20, marginTop: 2, marginBottom: 12 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayNav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayLabelWrap: { flex: 1, alignItems: 'center' },
  dayTitle: { fontSize: 16, fontWeight: '700', color: C.rustDark, textAlign: 'center' },
  dayDate: { fontSize: 13, color: C.subtext, textAlign: 'center' },
  backToToday: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  backToTodayText: { fontSize: 13, fontWeight: '700' },
  loader: { marginTop: 16 },
  errorText: { color: C.subtext, textAlign: 'center', marginTop: 16 },
  slot: { gap: 8, marginTop: 16 },
  // Home's cardLabel type.
  slotLabel: { fontSize: 13, fontWeight: '700', color: C.rustDark },
  // Home's goalPill shape; dashed like its empty-section placeholder.
  // The app-wide pill height (lib/buttonSize.js), 44dp to tap.
  addPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: BUTTON_HEIGHT, paddingHorizontal: 14,
    borderRadius: BUTTON_RADIUS, borderWidth: 1, borderStyle: 'dashed', borderColor: C.subtext,
    backgroundColor: withAlpha(C.card, 0.4),
  },
  addText: { fontSize: 13, fontWeight: '700' },
});
