// app/tracker-new.js
//
// New tracker: the user names it (no suggestions or examples anywhere,
// no placeholder text) and picks how a day is rated -- fixed once saved
// (supabase/migrations/0081_trackers.sql). A preview shows the chosen
// control; it isn't saved. Start tracking stays off until the name has
// text; at 5 trackers it shows the limit instead of saving. After saving,
// the Your trackers page: back to it when it opened this screen (param
// from=trackers, so there's never a second copy of it), otherwise it
// replaces this screen (opened from Home), so Back goes to Home.
import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken, withAlpha } from '../lib/theme';
import {
  listTrackers, createTracker, TRACKER_LIMIT, TRACKER_LIMIT_MESSAGE,
  TRACKER_NAME_MAX, TRACKER_UNIT_MAX, TRACKER_WORDS,
} from '../lib/trackers';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';
import TrackerControl from '../components/TrackerControl';

const METHODS = [
  { id: 'words', title: 'Words', sub: TRACKER_WORDS.join(', ') },
  { id: 'scale', title: 'A number from 0 to 10', sub: 'Slide to a number. You decide what 10 means.' },
  { id: 'amount', title: 'An amount', sub: 'You pick the unit.' },
];

export default function NewTracker() {
  const { session, profile } = useAuth();
  const { from } = useLocalSearchParams();
  const userId = session?.user?.id;
  const color = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [name, setName] = useState('');
  const [method, setMethod] = useState('words');
  const [unit, setUnit] = useState('');
  // The preview's own rating, never saved.
  const [previewValue, setPreviewValue] = useState(null);
  // How many trackers the user already has (null until read), for the
  // limit and the new one's place at the end.
  const [existing, setExisting] = useState(null);
  const [nextSort, setNextSort] = useState(0);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      listTrackers(userId).then(({ trackers, error }) => {
        if (error) return;
        setExisting(trackers.length);
        setNextSort(trackers.reduce((m, t) => Math.max(m, (t.sort_order ?? 0) + 1), 0));
      });
    }, [userId])
  );

  function pickMethod(id) {
    setMethod(id);
    setPreviewValue(null);
  }

  async function handleSave() {
    if (!userId || !name.trim() || saving) return;
    if (existing != null && existing >= TRACKER_LIMIT) {
      setStatus(TRACKER_LIMIT_MESSAGE);
      return;
    }
    setStatus('');
    setSaving(true);
    const { error, message } = await createTracker(userId, { name, method, unit, sortOrder: nextSort });
    setSaving(false);
    if (error) {
      setStatus(message);
      return;
    }
    if (from === 'trackers' && router.canGoBack()) router.back();
    else router.replace('/trackers');
  }

  const trimmed = name.trim();
  // The preview's name only feeds its TalkBack labels ("Preview: Some").
  const preview = { name: trimmed || 'Preview', method, unit: method === 'amount' && unit.trim() ? unit.trim() : null };

  return (
    <WallpaperBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">New tracker</Text>
            <TouchableOpacity
              style={styles.close}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label} nativeID="trackerNameLabel">What do you want to track?</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={TRACKER_NAME_MAX}
            accessibilityLabel="What do you want to track?"
            accessibilityLabelledBy="trackerNameLabel"
            returnKeyType="done"
          />
          <Text style={styles.helper}>Any name you like. Only you see it.</Text>

          <Text style={[styles.label, styles.sectionGap]}>How will you rate it each day?</Text>
          {METHODS.map((m) => {
            const checked = method === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.option, checked && { borderColor: color, backgroundColor: withAlpha(color, 0.06) }]}
                onPress={() => pickMethod(m.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                accessibilityLabel={`${m.title}. ${m.sub}`}
              >
                <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={22} color={checked ? color : C.subtext} />
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{m.title}</Text>
                  <Text style={styles.optionSub}>{m.sub}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {method === 'amount' && (
            <>
              <Text style={[styles.label, styles.sectionGap]}>Unit</Text>
              <TextInput
                style={styles.input}
                value={unit}
                onChangeText={setUnit}
                maxLength={TRACKER_UNIT_MAX}
                accessibilityLabel="Unit, optional"
                returnKeyType="done"
              />
              <Text style={styles.helper}>Optional.</Text>
            </>
          )}

          <Text style={[styles.label, styles.sectionGap]}>Preview</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{trimmed ? `${trimmed} today` : 'Today'}</Text>
            <TrackerControl tracker={preview} value={previewValue} onChange={setPreviewValue} color={color} />
          </View>

          {!!status && <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>}

          <View style={styles.buttons}>
            <View style={styles.buttonCell}>
              <Button title="Cancel" onPress={() => router.back()} variant="secondary" />
            </View>
            <View style={styles.buttonCell}>
              <Button title={saving ? 'Saving...' : 'Start tracking'} onPress={handleSave} disabled={!trimmed || saving} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  title: { flex: 1, fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 8 },
  sectionGap: { marginTop: 18 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    padding: 10, fontSize: 16, minHeight: 44,
    backgroundColor: C.card, color: C.text,
  },
  helper: { fontSize: 12, color: C.subtext, marginTop: 6 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 56, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  optionSub: { fontSize: 12, color: C.subtext, marginTop: 2, lineHeight: 16 },
  previewCard: { backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  previewTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 },
  status: { color: C.error, marginTop: 14, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  buttonCell: { flex: 1 },
});
