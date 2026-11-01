import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken } from '../lib/theme';
import { localDateString, parseLocalDateString } from '../lib/week';
import { RNR_SLOTS, RNR_SLOT_LABELS } from '../lib/rnrs';
import { useRnrDay } from '../lib/useRnrDay';
import { useRnrLogIt } from '../lib/useRnrLogIt';
import Button from './Button';
import RnrTile from './RnrTile';
import RnrMoveChooser from './RnrMoveChooser';
import QuickTicklePopover from './QuickTicklePopover';
import QuickTickleToast from './QuickTickleToast';

// The bottom bar's Routines and Reminders button opens this: today's
// tiles under Morning, Afternoon and Evening, each with Done, Move to
// and Skip, and a button into the full page (app/(tabs)/rnrs.js) for
// adding tiles and planning other days. Close, Android Back and the
// dimmed area close it. Loads fresh each time it opens. Edge to edge
// (statusBarTranslucent + navigationBarTranslucent) like Quick Tickle's
// popover, so a Log it pill measured in here lines up with that sheet.
export default function RnrsPopup({ visible, onClose }) {
  const { session, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const today = localDateString();
  const day = useRnrDay(userId, today, visible);
  const logIt = useRnrLogIt(userId, {
    onLogged: (p) => day.dropLogIt(p.id),
    beforeLeave: onClose,
  });
  const [moving, setMoving] = useState(null);

  const todayLabel = parseLocalDateString(today).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const bySlot = Object.fromEntries(RNR_SLOTS.map((s) => [s, day.placements.filter((p) => p.slot === s)]));
  const isEmpty = day.placements.length === 0;

  function close() {
    logIt.dismissToast();
    setMoving(null);
    onClose();
  }

  function openFullPage() {
    close();
    router.navigate('/rnrs');
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View
        style={[
          styles.backdrop,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title} accessibilityRole="header">Today</Text>
              <Text style={styles.date}>{todayLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={close}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={C.subtext} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {day.loading && isEmpty && <ActivityIndicator color={C.rust} style={styles.loader} />}
            {!day.loading && day.loadError && (
              <Text style={styles.emptyText}>Couldn't load your tiles — please try again later.</Text>
            )}
            {!day.loading && !day.loadError && isEmpty && (
              <View style={styles.emptyRow}>
                <View
                  style={styles.placeholderPill}
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                />
                <TouchableOpacity
                  onPress={openFullPage}
                  style={styles.addButton}
                  accessibilityRole="button"
                  accessibilityLabel="Add a tile"
                >
                  <Ionicons name="add" size={16} color={accentDark} />
                  <Text style={[styles.addText, { color: accentDark }]}>Add a tile</Text>
                </TouchableOpacity>
              </View>
            )}
            {RNR_SLOTS.filter((s) => bySlot[s].length > 0).map((s) => (
              <View key={s} style={styles.slot}>
                <Text style={styles.slotLabel} accessibilityRole="header">{RNR_SLOT_LABELS[s]}</Text>
                {bySlot[s].map((p) => (
                  <RnrTile
                    key={p.id}
                    placement={p}
                    accentDark={accentDark}
                    showLogIt={day.logItIds.has(p.id)}
                    onSetStatus={day.setStatus}
                    onMoveTo={setMoving}
                    onMoveSlot={(pl, slot) => day.move(pl, { slot })}
                    onLogIt={logIt.open}
                  />
                ))}
              </View>
            ))}
          </ScrollView>

          <Button
            title="Open Routines and Reminders"
            onPress={openFullPage}
            variant="secondary"
            style={styles.openButton}
          />

          <QuickTickleToast {...logIt.toastProps} style={styles.toast} />
        </View>
      </View>

      <RnrMoveChooser
        placement={moving}
        onPickSlot={(slot) => {
          const p = moving;
          setMoving(null);
          day.move(p, { slot });
        }}
        onClose={() => setMoving(null)}
      />
      <QuickTicklePopover {...logIt.popoverProps} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  // EntryCard's menuBackdrop dim, sheet centred.
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  sheet: {
    width: '100%', maxWidth: 440, maxHeight: '88%',
    backgroundColor: C.bg, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: 'bold', color: C.rustDark },
  date: { fontSize: 13, color: C.subtext, marginTop: 2 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10, marginTop: -8 },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 4 },
  loader: { marginVertical: 16 },
  emptyText: { color: C.subtext, marginVertical: 12 },
  // Home's empty-section placeholder pill (dashed C.faint, 96 wide).
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  placeholderPill: {
    width: 96, minHeight: 40, borderRadius: 20, borderWidth: 1,
    borderStyle: 'dashed', borderColor: C.faint,
  },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 4 },
  addText: { fontSize: 14, fontWeight: '700' },
  // Home's cardLabel type.
  slot: { gap: 8, marginTop: 8 },
  slotLabel: { fontSize: 13, fontWeight: '700', color: C.rustDark },
  openButton: { marginTop: 12 },
  toast: { marginTop: 10 },
});
