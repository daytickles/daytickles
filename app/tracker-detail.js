// app/tracker-detail.js
//
// One private tracker (lib/trackers.js), opened from its name on the Your
// trackers page: /tracker-detail?id=<trackerId>. Shows how it's rated
// (fixed once started, migration 0081), a rename field, the last 7 or 30
// days as the same mini trail with three plain numbers, and Delete.
// Nothing here judges a rating. Rename and delete only change anything
// once the server has accepted them; on failure a friendly line shows
// and the screen stays as it was. After a delete, the Your trackers page
// is back in front (the detail screen goes, it isn't stacked); that page
// and Home's card read again when they come back into focus.
import { useCallback, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken, textOn } from '../lib/theme';
import { showAlert } from '../lib/themedAlert';
import { localDateString } from '../lib/week';
import {
  listTrackers, listRatings, renameTracker, deleteTracker, formatAmount,
  TRACKER_HISTORY_DAYS, TRACKER_NAME_MAX, TRACKER_WORDS,
} from '../lib/trackers';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';
import { TrackerTrail } from '../components/TrackerControl';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
];

// How the tracker is rated, as one read-only line.
function methodLine(tracker) {
  if (tracker.method === 'words') return 'Words';
  if (tracker.method === 'scale') return '0 to 10';
  return tracker.unit ? `An amount (${tracker.unit})` : 'An amount';
}

// One decimal, without a trailing .0.
function oneDecimal(n) {
  return String(Math.round(n * 10) / 10);
}

// Days rated, Highest, and Average (or Most often, for Words) over the
// last `days` local days, or null when none of them is rated.
function rangeStats(tracker, ratings, days) {
  const values = [];
  for (let i = 0; i < days; i++) {
    const day = localDateString(i);
    if (ratings && ratings.has(day)) values.push(ratings.get(day));
  }
  if (values.length === 0) return null;
  const highest = Math.max(...values);
  if (tracker.method === 'words') {
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    let mostOften = null;
    for (const [v, n] of counts) {
      const best = mostOften == null ? 0 : counts.get(mostOften);
      // A tie goes to the higher word.
      if (n > best || (n === best && v > mostOften)) mostOften = v;
    }
    return {
      rated: values.length,
      highest: TRACKER_WORDS[highest],
      thirdLabel: 'Most often',
      third: TRACKER_WORDS[mostOften],
    };
  }
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const unit = tracker.method === 'amount' && tracker.unit ? ` ${tracker.unit}` : '';
  return {
    rated: values.length,
    highest: tracker.method === 'scale' ? String(highest) : `${formatAmount(highest)}${unit}`,
    thirdLabel: 'Average',
    third: `${oneDecimal(average)}${unit}`,
  };
}

export default function TrackerDetail() {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const { id } = useLocalSearchParams();
  const color = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [tracker, setTracker] = useState(null);
  const [ratings, setRatings] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameMessage, setRenameMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [range, setRange] = useState(7);
  // The name as last read, so a reload only replaces the rename field
  // when it hasn't been edited.
  const loadedName = useRef('');

  const load = useCallback(async () => {
    if (!userId || !id) return;
    setLoadError(false);
    const { trackers, error } = await listTrackers(userId);
    if (error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    const found = trackers.find((t) => t.id === id) || null;
    if (found) {
      const { ratings: read, error: ratingsError } = await listRatings(userId, [found.id], localDateString(TRACKER_HISTORY_DAYS - 1));
      if (ratingsError) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setRatings(read.get(found.id) || new Map());
      setDraftName((prev) => (prev === '' || prev === loadedName.current ? found.name : prev));
      loadedName.current = found.name;
    }
    setTracker(found);
    setLoading(false);
  }, [userId, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRename() {
    if (!tracker || renaming) return;
    setRenameMessage('');
    setRenaming(true);
    const { error, message } = await renameTracker(userId, tracker.id, draftName);
    setRenaming(false);
    if (error) {
      setRenameMessage(message);
      return;
    }
    const name = draftName.trim();
    loadedName.current = name;
    setTracker({ ...tracker, name });
    setDraftName(name);
  }

  function confirmDelete() {
    if (!tracker) return;
    showAlert(
      `Delete ${tracker.name}?`,
      "This also deletes all its ratings. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
      ]
    );
  }

  async function handleDelete() {
    if (!tracker || deleting) return;
    setDeleteMessage('');
    setDeleting(true);
    const { error } = await deleteTracker(userId, tracker.id);
    setDeleting(false);
    if (error) {
      setDeleteMessage("Couldn't delete this tracker right now.");
      return;
    }
    // Opened from the Your trackers page, which is right underneath: go
    // back to it. Otherwise swap this screen for it.
    if (router.canGoBack()) router.back();
    else router.replace('/trackers');
  }

  const trimmedDraft = draftName.trim();
  const canSave = !!tracker && trimmedDraft.length > 0 && trimmedDraft !== tracker.name && !renaming;
  const stats = tracker ? rangeStats(tracker, ratings, range) : null;

  return (
    <WallpaperBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backLink}>‹ Back</Text>
          </TouchableOpacity>

          {loading && !tracker && <ActivityIndicator color={C.rust} style={styles.loader} />}

          {!loading && !tracker && (
            <Text style={styles.emptyText}>
              {loadError
                ? "Couldn't load this tracker. Check your connection and try again."
                : "This tracker isn't available anymore."}
            </Text>
          )}

          {!!tracker && (
            <>
              <Text style={styles.title} accessibilityRole="header">{tracker.name}</Text>
              <Text style={styles.methodLine}>{methodLine(tracker)}</Text>
              <Text style={styles.helper}>How you rate it can't be changed once started. To change it, add a new tracker.</Text>

              <Text style={[styles.label, styles.sectionGap]} nativeID="trackerRenameLabel">Name</Text>
              <TextInput
                style={styles.input}
                value={draftName}
                onChangeText={setDraftName}
                maxLength={TRACKER_NAME_MAX}
                accessibilityLabel="Name"
                accessibilityLabelledBy="trackerRenameLabel"
                returnKeyType="done"
              />
              <View style={styles.saveRow}>
                <Button title={renaming ? 'Saving...' : 'Save'} onPress={handleRename} disabled={!canSave} />
              </View>
              {!!renameMessage && <Text style={styles.message} accessibilityLiveRegion="polite">{renameMessage}</Text>}

              <View style={[styles.rangeSwitch, styles.sectionGap]}>
                {RANGES.map((r) => {
                  const selected = range === r.days;
                  return (
                    <TouchableOpacity
                      key={r.days}
                      style={[styles.rangeOption, selected && { backgroundColor: color, borderColor: color }]}
                      onPress={() => setRange(r.days)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Show the last ${r.label}`}
                    >
                      <Text style={[styles.rangeText, selected && { color: textOn(color) }]}>{r.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.card}>
                <TrackerTrail tracker={tracker} ratings={ratings} color={color} dayCount={range} />
                {stats ? (
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{stats.rated}</Text>
                      <Text style={styles.statLabel}>Days rated</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{stats.highest}</Text>
                      <Text style={styles.statLabel}>Highest</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{stats.third}</Text>
                      <Text style={styles.statLabel}>{stats.thirdLabel}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.nothingRated}>Nothing rated in this time yet.</Text>
                )}
              </View>

              <View style={styles.sectionGap}>
                <Button
                  title={deleting ? 'Deleting...' : 'Delete tracker and its ratings'}
                  onPress={confirmDelete}
                  variant="secondary"
                  color={C.error}
                  disabled={deleting}
                />
              </View>
              {!!deleteMessage && <Text style={styles.message} accessibilityLiveRegion="polite">{deleteMessage}</Text>}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  loader: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24, lineHeight: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  methodLine: { fontSize: 15, fontWeight: '600', color: C.text, marginTop: 8 },
  helper: { fontSize: 12, color: C.subtext, marginTop: 4, lineHeight: 16 },
  sectionGap: { marginTop: 20 },
  label: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    padding: 10, fontSize: 16, minHeight: 44,
    backgroundColor: C.card, color: C.text,
  },
  saveRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  message: { color: C.error, marginTop: 10, textAlign: 'center' },
  rangeSwitch: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  rangeOption: {
    flex: 1, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  rangeText: { fontSize: 14, fontWeight: '600', color: C.text },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14 },
  statsRow: { flexDirection: 'row', marginTop: 16, gap: 8 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center' },
  statLabel: { fontSize: 12, color: C.subtext, marginTop: 2, textAlign: 'center' },
  nothingRated: { fontSize: 14, color: C.subtext, marginTop: 16, textAlign: 'center' },
});
