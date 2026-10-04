// app/testing-checklist.js
//
// TEMPORARY -- internal-testing checklist, reached from Settings'
// "Internal Testing" card. Remove this screen and that card before
// public release.
//
// Checked state and scratch notes live in AsyncStorage only, under one
// key, per device -- throwaway tester state, never synced to Supabase.
// Item ids are stable strings rather than array indexes, so reordering
// or rewording an item here never reassigns someone's ticks.

import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, withAlpha } from '../lib/theme';
import WallpaperBackground from '../components/WallpaperBackground';

const STORAGE_KEY = 'daytickles-testing-checklist';

const SECTIONS = [
  {
    title: 'App lock',
    items: [
      { id: 'lock-set-pin', label: 'Set a PIN' },
      { id: 'lock-home-reopen', label: 'Background the app (Home button) and reopen' },
      { id: 'lock-sleep-wake', label: 'Put the device to sleep and wake it' },
      { id: 'lock-biometrics', label: 'Try biometrics' },
      { id: 'lock-forgot-pin', label: 'Try "Forgot PIN"' },
    ],
  },
  {
    title: 'Photos',
    items: [
      { id: 'photo-open-own', label: 'Open a photo on your own entry' },
      { id: 'photo-open-other-rippled', label: "Open a photo on someone else's Rippled entry (photo-attached text entry)" },
      { id: 'photo-open-other-polaroid', label: 'Open a photo-only Polaroid from someone else' },
      { id: 'photo-take-new', label: 'Take a new photo' },
      { id: 'photo-pick-gallery', label: 'Pick from gallery' },
      { id: 'photo-relink', label: 'Use Relink' },
      { id: 'photo-save-to-photos', label: 'Use Save to Photos' },
    ],
  },
  {
    title: 'Multickles',
    items: [
      { id: 'multickle-start-icon', label: 'Start one with an icon' },
      { id: 'multickle-tag-rippled', label: 'Tag a Rippled Tickle to it' },
      { id: 'multickle-follow-other', label: "Follow someone else's Multickle" },
      { id: 'multickle-following-pills', label: "Check the Following tab pills (filter works, shows other authors' Tics)" },
      { id: 'multickle-complete', label: 'Mark one Complete' },
      { id: 'multickle-ongoing-cap', label: 'Confirm the ongoing cap blocks correctly once at the limit' },
    ],
  },
  {
    title: 'Goals',
    items: [
      { id: 'goal-create', label: 'Create one' },
      { id: 'goal-tag-entry', label: 'Tag an entry to it' },
      { id: 'goal-achieve', label: 'Achieve one' },
      { id: 'goal-ordering', label: 'Confirm ordering (newest first, achieved last)' },
    ],
  },
  {
    title: 'Notifications',
    items: [
      { id: 'notif-trigger', label: 'Trigger one (e.g. have someone Ripple a Tic on a Multickle you follow)' },
      { id: 'notif-tap', label: 'Tap it' },
    ],
  },
  {
    title: 'General',
    items: [
      { id: 'general-icon-splash', label: 'App icon/splash look right' },
      { id: 'general-dark-photo-tabbar', label: 'Nothing visually broken on a dark photo behind the tab bar' },
    ],
  },
];

const TOTAL_ITEMS = SECTIONS.reduce((n, s) => n + s.items.length, 0);

export default function TestingChecklist() {
  // { [itemId]: { checked: boolean, note: string } }
  const [state, setState] = useState({});
  // Item ids whose note field the tester has opened this visit -- a
  // field with a saved note stays open regardless.
  const [openNotes, setOpenNotes] = useState(new Set());
  const loadedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => {
        loadedRef.current = true;
      });
  }, []);

  // Persist after every change, but never before the initial load has
  // landed -- otherwise the empty initial state could overwrite saved ticks.
  useEffect(() => {
    if (!loadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  function toggleChecked(id) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], checked: !prev[id]?.checked } }));
  }

  function setNote(id, note) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], note } }));
    // Keep the field open while editing, so deleting a saved note down to
    // empty doesn't make it vanish mid-keystroke.
    openNote(id);
  }

  function openNote(id) {
    setOpenNotes((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  const checkedCount = SECTIONS.reduce(
    (n, s) => n + s.items.filter((item) => state[item.id]?.checked).length,
    0
  );

  return (
    <WallpaperBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Testing Checklist</Text>
        <Text style={styles.explainerText}>
          Temporary — removed before public release. Ticks and notes are saved on this device only,
          as a scratchpad before you report back.
        </Text>
        <Text style={styles.progressText}>
          {checkedCount} of {TOTAL_ITEMS} checked
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.label}>{section.title}</Text>
            {section.items.map((item) => {
              const itemState = state[item.id] || {};
              const note = itemState.note || '';
              const noteOpen = !!note || openNotes.has(item.id);
              return (
                <View key={item.id} style={styles.itemBlock}>
                  <View style={styles.itemRow}>
                    <TouchableOpacity
                      style={styles.checkTouch}
                      onPress={() => toggleChecked(item.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={itemState.checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={itemState.checked ? C.rust : C.subtext}
                      />
                      <Text style={[styles.itemLabel, itemState.checked && styles.itemLabelChecked]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                    {!noteOpen && (
                      <TouchableOpacity
                        onPress={() => openNote(item.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="create-outline" size={18} color={C.subtext} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {noteOpen && (
                    <TextInput
                      style={styles.noteInput}
                      value={note}
                      onChangeText={(text) => setNote(item.id, text)}
                      placeholder="Note (optional)"
                      placeholderTextColor={C.faint}
                      // Focus straight away when opened from the note icon
                      // (empty), but not when a saved note mounts on load.
                      autoFocus={!note}
                      multiline
                    />
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 8 },
  explainerText: { fontSize: 12, color: C.subtext, lineHeight: 16 },
  progressText: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 10, marginBottom: 16 },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16,
    backgroundColor: withAlpha(C.subtext, 0.1), borderColor: C.border,
  },
  label: { fontSize: 14, color: C.subtext, marginBottom: 10 },
  itemBlock: { paddingVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  checkTouch: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  itemLabel: { flex: 1, fontSize: 15, color: C.text, marginLeft: 10 },
  itemLabelChecked: { color: C.subtext },
  noteInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, marginLeft: 32,
    fontSize: 14, backgroundColor: C.card, color: C.text,
  },
});
