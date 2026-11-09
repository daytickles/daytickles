// app/trackers.js
//
// Your trackers: the user's private trackers (lib/trackers.js), each with
// today's rating control and a 7-day mini trail. Every tap saves at once
// (optimistic; on failure the control goes back and the usual "Couldn't
// save that" shows). Writes for one tracker go one at a time, newest
// value last, so fast taps can't land out of order. Only the owner ever
// sees this. Nothing here reacts to a rating: no praise, streaks, or
// judging colours, and no reminders.
import { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken, withAlpha } from '../lib/theme';
import { showSaveFailed } from '../lib/themedAlert';
import { localDateString } from '../lib/week';
import {
  listTrackers, listRatings, setRating, clearRating, ratingLabel,
} from '../lib/trackers';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';
import TrackerControl, { TrackerTrail } from '../components/TrackerControl';

// "Monday 9 November": the weekday, then the day and month (en-GB, no
// comma between them).
function todayLine() {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const dayMonth = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  return `${weekday} ${dayMonth}. Rate each one today, or leave it.`;
}

// A copy of the ratings map with one tracker's day set (or removed).
function withValue(ratings, trackerId, day, value) {
  const next = new Map(ratings);
  const days = new Map(next.get(trackerId) || []);
  if (value == null) days.delete(day);
  else days.set(day, value);
  next.set(trackerId, days);
  return next;
}

export default function Trackers() {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const color = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [trackers, setTrackers] = useState([]);
  const [ratings, setRatings] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // The latest ratings, for the write queue (which runs across renders).
  const ratingsRef = useRef(ratings);
  ratingsRef.current = ratings;
  // Per tracker: { busy, pending: { value } | null, confirmed } --
  // confirmed is the value the server last accepted, which a failed
  // write puts back.
  const writes = useRef(new Map());

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(false);
    const { trackers: list, error } = await listTrackers(userId);
    if (error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    const { ratings: read, error: ratingsError } = await listRatings(userId, list.map((t) => t.id));
    if (ratingsError) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    // A tracker with a write still on its way keeps what's on screen.
    const merged = new Map(read);
    for (const [id, w] of writes.current) {
      if (w.busy || w.pending) merged.set(id, ratingsRef.current.get(id) || new Map());
      else writes.current.delete(id);
    }
    setTrackers(list);
    setRatings(merged);
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function drain(trackerId, day, w) {
    w.busy = true;
    while (w.pending) {
      const { value } = w.pending;
      w.pending = null;
      const error = value == null
        ? await clearRating(trackerId, day)
        : await setRating(userId, trackerId, day, value);
      if (error) {
        w.pending = null;
        setRatings((prev) => withValue(prev, trackerId, day, w.confirmed));
        showSaveFailed();
        break;
      }
      w.confirmed = value;
    }
    w.busy = false;
  }

  function rate(tracker, value) {
    if (!userId) return;
    const day = localDateString(0);
    let w = writes.current.get(tracker.id);
    if (!w) {
      const current = ratingsRef.current.get(tracker.id)?.get(day);
      w = { busy: false, pending: null, confirmed: current == null ? null : current };
      writes.current.set(tracker.id, w);
    }
    setRatings((prev) => withValue(prev, tracker.id, day, value));
    w.pending = { value };
    if (!w.busy) drain(tracker.id, day, w);
  }

  // New tracker, told it came from here, so saving goes back to this
  // page instead of stacking a second one on top of it.
  function openNewTracker() {
    router.push({ pathname: '/tracker-new', params: { from: 'trackers' } });
  }

  const today = localDateString(0);

  return (
    <WallpaperBackground>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">Your trackers</Text>
          <View style={styles.onlyYou} accessible accessibilityLabel="Only you can see your trackers">
            <Ionicons name="lock-closed" size={12} color={C.subtext} />
            <Text style={styles.onlyYouText}>Only you</Text>
          </View>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: color }]}
            onPress={openNewTracker}
            accessibilityRole="button"
            accessibilityLabel="Add a tracker"
          >
            <Ionicons name="add" size={22} color={C.card} />
          </TouchableOpacity>
        </View>

        <Text style={styles.dateLine}>{todayLine()}</Text>

        {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

        {!loading && loadError && (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Couldn't load your trackers. Check your connection and try again.</Text>
            <Button title="Try again" onPress={() => { setLoading(true); load(); }} variant="secondary" />
          </View>
        )}

        {!loading && !loadError && trackers.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Button title="Add a tracker" onPress={openNewTracker} />
          </View>
        )}

        {!loading && !loadError && trackers.map((tracker) => {
          const days = ratings.get(tracker.id);
          const value = days && days.has(today) ? days.get(today) : null;
          return (
            <View key={tracker.id} style={styles.card}>
              <View style={styles.cardHeader}>
                {/* The name opens this tracker's own screen (history, rename,
                    delete). hitSlop gives it a 44dp-tall target without
                    changing the card's layout. */}
                <TouchableOpacity
                  style={styles.nameTap}
                  onPress={() => router.push({ pathname: '/tracker-detail', params: { id: tracker.id } })}
                  hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${tracker.name}. Opens its history, rename and delete.`}
                >
                  <Text style={styles.name}>{tracker.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.subtext} />
                </TouchableOpacity>
                <Text style={[styles.state, value == null && styles.stateNotRated]}>{ratingLabel(tracker, value)}</Text>
              </View>
              <TrackerControl tracker={tracker} value={value} onChange={(v) => rate(tracker, v)} color={color} />
              <TrackerTrail tracker={tracker} ratings={days} color={color} />
            </View>
          );
        })}
      </ScrollView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, flexShrink: 1 },
  onlyYou: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, backgroundColor: withAlpha(C.subtext, 0.08),
  },
  onlyYouText: { fontSize: 11, fontWeight: '700', color: C.subtext },
  addButton: {
    marginLeft: 'auto', width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  dateLine: { fontSize: 14, color: C.subtext, marginTop: 10, marginBottom: 16, lineHeight: 20 },
  loader: { marginTop: 12 },
  centered: { alignItems: 'center', gap: 14, marginTop: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.text },
  emptyText: { color: C.subtext, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  nameTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: C.text },
  state: { fontSize: 14, fontWeight: '600', color: C.text, textAlign: 'right', flexShrink: 1 },
  stateNotRated: { fontWeight: '400', color: C.subtext },
});
