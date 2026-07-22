import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, moodColorFor } from '../lib/theme';
import { shareEntry, shareStatus, SHARE_CAPTIONS } from '../lib/sharing';
import Button from '../components/Button';

const DAY_MS = 24 * 60 * 60 * 1000;
const PINNED_WINDOW_DAYS = 14;

function dateStr(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function formatEntryDate(entryDate) {
  return new Date(`${entryDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function likeLabel(count) {
  const n = count || 0;
  return `${n} ${n === 1 ? 'like' : 'likes'}`;
}

// Consecutive days with at least one entry, walking back from today (or
// from yesterday if nothing's been logged yet today, so an entry-free
// "today so far" doesn't zero out an otherwise-live streak).
function computeStreak(entries) {
  const entryDates = new Set(entries.map((e) => e.entry_date));
  let cursor = entryDates.has(dateStr(0)) ? 0 : 1;
  let streak = 0;
  while (entryDates.has(dateStr(cursor))) {
    streak++;
    cursor++;
  }
  return streak;
}

export default function Home() {
  const { session, profile, refreshProfile } = useAuth();
  const accent = accentFor(profile?.accent_theme);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [pickerEntryId, setPickerEntryId] = useState(null);
  const [shareEntryId, setShareEntryId] = useState(null);

  const loadEntries = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('tickle_entries')
      .select('id, entry_date, text_content, mood, like_count, goal_id, created_at')
      .eq('user_id', session.user.id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error) setEntries(data || []);
    setLoading(false);
  }, [session]);

  const loadGoals = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error) setGoals(data || []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  const goalsById = Object.fromEntries(goals.map((g) => [g.id, g]));

  async function assignGoal(entryId, goalId) {
    const previous = entries;
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, goal_id: goalId } : e)));
    setPickerEntryId(null);

    const { error } = await supabase
      .from('tickle_entries')
      .update({ goal_id: goalId })
      .eq('id', entryId);

    if (error) setEntries(previous);
  }

  async function handleShare(entry, captionId) {
    setShareEntryId(null);
    await shareEntry({ profile, entry, captionId, onProfileUpdated: refreshProfile });
  }

  const streak = computeStreak(entries);
  const totalTickles = entries.length;
  const totalLikes = entries.reduce((sum, e) => sum + (e.like_count || 0), 0);

  const pinnedCutoff = dateStr(PINNED_WINDOW_DAYS - 1);
  const pinned = entries
    .filter((e) => e.entry_date >= pinnedCutoff)
    .reduce((best, e) => (!best || e.like_count > best.like_count ? e : best), null);

  function renderEntryBody(entry) {
    const taggedGoal = entry.goal_id ? goalsById[entry.goal_id] : null;
    return (
      <View style={styles.entryRow}>
        <View style={[styles.moodDot, { backgroundColor: moodColorFor(entry.mood, accent) }]} />
        <View style={styles.entryBody}>
          <Text style={styles.entryText}>{entry.text_content}</Text>
          <View style={styles.entryMetaRow}>
            <Text style={styles.entryDate}>{formatEntryDate(entry.entry_date)}</Text>
            <View style={styles.entryMetaRight}>
              <Text style={styles.entryLikes}>{likeLabel(entry.like_count)}</Text>
              <TouchableOpacity
                onPress={() => setShareEntryId(entry.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.shareLink}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setPickerEntryId(entry.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View
            style={[
              styles.goalDot,
              taggedGoal ? { backgroundColor: taggedGoal.color } : styles.goalDotEmpty,
            ]}
          />
        </TouchableOpacity>
      </View>
    );
  }

  const pickerEntry = entries.find((e) => e.id === pickerEntryId) || null;
  const shareTargetEntry = entries.find((e) => e.id === shareEntryId) || null;
  const shareStat = profile ? shareStatus(profile) : null;
  const shareBlocked = !!shareStat && !shareStat.unlimited && shareStat.remaining <= 0;

  return (
    <>
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={entries}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <View style={styles.entryCard}>{renderEntryBody(item)}</View>}
      ListHeaderComponent={
        <View>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Welcome to DayTickles</Text>
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.settingsLink}>⚙</Text>
            </TouchableOpacity>
          </View>
          {profile && <Text style={styles.profileText}>{profile.avatar_emoji} {profile.username}</Text>}

          <View style={styles.streakCard}>
            <Text style={styles.streakNumber}>{streak}</Text>
            <Text style={styles.streakLabel}>day smile streak</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalTickles}</Text>
              <Text style={styles.statLabel}>Tickles</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalLikes}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
          </View>

          <Button title="New Tickle" onPress={() => router.push('/create')} variant="primary" />

          {pinned && (
            <View style={[styles.entryCard, styles.pinnedCard]}>
              <Text style={styles.pinnedLabel}>Most liked this week</Text>
              {renderEntryBody(pinned)}
            </View>
          )}

          {entries.length > 0 && <Text style={styles.sectionLabel}>Your tickles</Text>}
          {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}
        </View>
      }
      ListEmptyComponent={
        !loading && (
          <Text style={styles.emptyText}>No tickles yet — write about what made you smile today.</Text>
        )
      }
    />

    <Modal
      visible={!!pickerEntry}
      transparent
      animationType="fade"
      onRequestClose={() => setPickerEntryId(null)}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={() => setPickerEntryId(null)}
      >
        <TouchableOpacity activeOpacity={1} style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.pickerTitle}>Tag with a goal</Text>

          {goals.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={styles.pickerRow}
              onPress={() => assignGoal(pickerEntry.id, g.id)}
            >
              <View style={[styles.goalDot, { backgroundColor: g.color }]} />
              <Text style={styles.pickerRowLabel}>{g.label}</Text>
            </TouchableOpacity>
          ))}

          {goals.length === 0 && (
            <Text style={styles.pickerEmpty}>No goals yet — add one from Manage Goals.</Text>
          )}

          {pickerEntry?.goal_id && (
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => assignGoal(pickerEntry.id, null)}
            >
              <View style={[styles.goalDot, styles.goalDotEmpty]} />
              <Text style={styles.pickerRowLabel}>Remove tag</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    <Modal
      visible={!!shareTargetEntry}
      transparent
      animationType="fade"
      onRequestClose={() => setShareEntryId(null)}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={() => setShareEntryId(null)}
      >
        <TouchableOpacity activeOpacity={1} style={styles.pickerSheet} onPress={() => {}}>
          {shareBlocked ? (
            <>
              <Text style={styles.pickerTitle}>Share limit reached</Text>
              <Text style={styles.shareBlockedText}>
                You've used all {shareStat.cap} shares for this 30-day period. It renews
                automatically, or go unlimited with a paid plan.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.pickerTitle}>Share this tickle</Text>
              {SHARE_CAPTIONS.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.pickerRow}
                  onPress={() => handleShare(shareTargetEntry, c.id)}
                >
                  <Text style={styles.pickerRowLabel}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: C.rustDark },
  settingsLink: { fontSize: 22, color: C.subtext },
  profileText: { marginBottom: 16, fontSize: 16, color: C.text },

  streakCard: {
    backgroundColor: C.card, borderRadius: 18, paddingVertical: 20,
    alignItems: 'center', marginBottom: 12,
  },
  streakNumber: { fontSize: 40, fontWeight: 'bold', color: C.rust },
  streakLabel: { fontSize: 14, color: C.subtext, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 18,
    paddingVertical: 16, alignItems: 'center',
  },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: C.rustDark },
  statLabel: { fontSize: 12, color: C.subtext, marginTop: 2 },

  pinnedCard: {
    marginTop: 20, borderWidth: 1.5, borderColor: C.amberDark, backgroundColor: C.sparkleBg,
  },
  pinnedLabel: {
    fontSize: 12, fontWeight: '600', color: C.sparkleText,
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  sectionLabel: { fontSize: 14, fontWeight: '600', color: C.subtext, marginTop: 8, marginBottom: 8 },
  loader: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 12 },

  entryCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12,
  },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  moodDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12, marginTop: 4 },
  entryBody: { flex: 1 },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },
  entryMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 8,
  },
  entryDate: { fontSize: 12, color: C.subtext },
  entryMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  entryLikes: { fontSize: 12, color: C.rust, fontWeight: '600' },
  shareLink: { fontSize: 12, color: C.subtext, fontWeight: '600' },

  goalDot: { width: 16, height: 16, borderRadius: 8, marginLeft: 12, marginTop: 4 },
  goalDotEmpty: {
    backgroundColor: 'transparent', borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: C.faint,
  },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  pickerSheet: {
    width: '100%', backgroundColor: C.card, borderRadius: 18, padding: 16,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: C.rustDark, marginBottom: 12 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  pickerRowLabel: { fontSize: 15, color: C.text, marginLeft: 12 },
  pickerEmpty: { fontSize: 14, color: C.subtext, fontStyle: 'italic', paddingVertical: 8 },
  shareBlockedText: { fontSize: 14, color: C.subtext, lineHeight: 20 },
});
