import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, moodColorFor, textOn } from '../lib/theme';
import { shareEntry, shareStatus, SHARE_CAPTIONS } from '../lib/sharing';
import Button from '../components/Button';
import HomeGuide from '../components/HomeGuide';

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
  const [unreadCount, setUnreadCount] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  // Auto-show the first-run guide exactly once, gated on the DB flag —
  // not local/session state, so it stays correctly "seen" across
  // reinstalls and devices. The same guide is reachable anytime,
  // ungated, from Settings ("How DayTickles works").
  useEffect(() => {
    if (profile && !profile.home_guide_seen) setShowGuide(true);
  }, [profile]);

  async function handleCloseGuide() {
    setShowGuide(false);
    if (profile && !profile.home_guide_seen) {
      await supabase.from('profiles').update({ home_guide_seen: true }).eq('id', profile.id);
      await refreshProfile();
    }
  }

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

  const loadUnreadCount = useCallback(async () => {
    if (!session) return;
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', session.user.id)
      .eq('is_read', false);

    if (!error) setUnreadCount(count || 0);
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

  useFocusEffect(
    useCallback(() => {
      loadUnreadCount();
    }, [loadUnreadCount])
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

  // Same scroll-to-and-highlight mechanism notifications.js already
  // uses to jump into Feed's Mine tab at a specific entry.
  function goToEntryInFeed(entryId) {
    router.push({ pathname: '/feed', params: { tab: 'mine', highlightEntry: entryId } });
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
          <Text style={styles.entryText} numberOfLines={1}>{entry.text_content}</Text>
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
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.entryCard}
          activeOpacity={0.8}
          onPress={() => goToEntryInFeed(item.id)}
        >
          {renderEntryBody(item)}
        </TouchableOpacity>
      )}
      ListHeaderComponent={
        <View>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Welcome to DayTickles</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => router.push('/feed')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.feedLink}>Feed</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/notifications')}
                style={styles.bellButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="notifications-outline" size={20} color={C.subtext} />
                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/settings')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.settingsLink}>⚙</Text>
              </TouchableOpacity>
            </View>
          </View>
          {profile && <Text style={styles.profileText}>{profile.avatar_emoji} {profile.username}</Text>}

          <View style={[styles.streakCard, { backgroundColor: accent.card }]}>
            <Text style={[styles.streakNumber, { color: textOn(accent.card) }]}>{streak}</Text>
            <Text style={[styles.streakLabel, { color: textOn(accent.card) }]}>day smile streak</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, styles.statCardTickles]}>
              <Text style={[styles.statNumber, styles.statNumberTickles]}>{totalTickles}</Text>
              <Text style={[styles.statLabel, styles.statLabelTickles]}>Tickles</Text>
            </View>
            <View style={[styles.statCard, styles.statCardLikes]}>
              <Text style={[styles.statNumber, styles.statNumberLikes]}>{totalLikes}</Text>
              <Text style={[styles.statLabel, styles.statLabelLikes]}>Likes</Text>
            </View>
          </View>

          <Button title="New Tickle" onPress={() => router.push('/create')} variant="primary" />

          {pinned && (
            <TouchableOpacity
              style={[styles.entryCard, styles.pinnedCard]}
              activeOpacity={0.8}
              onPress={() => goToEntryInFeed(pinned.id)}
            >
              <Text style={styles.pinnedLabel}>Most liked this week</Text>
              {renderEntryBody(pinned)}
            </TouchableOpacity>
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

    <HomeGuide visible={showGuide} onClose={handleCloseGuide} />
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  feedLink: { fontSize: 14, fontWeight: '600', color: C.rust },
  bellButton: { position: 'relative' },
  unreadBadge: {
    position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.rust, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  unreadBadgeText: { fontSize: 10, fontWeight: '700', color: C.bg },
  settingsLink: { fontSize: 22, color: C.subtext },
  profileText: { marginBottom: 16, fontSize: 16, color: C.text },

  streakCard: {
    borderRadius: 18, paddingVertical: 20,
    alignItems: 'center', marginBottom: 12,
  },
  streakNumber: { fontSize: 40, fontWeight: 'bold' },
  streakLabel: { fontSize: 14, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, borderRadius: 18,
    paddingVertical: 16, alignItems: 'center',
  },
  statCardTickles: { backgroundColor: C.amberBg },
  statCardLikes: { backgroundColor: C.teal },
  statNumber: { fontSize: 24, fontWeight: 'bold' },
  statNumberTickles: { color: C.amberText },
  statNumberLikes: { color: C.tealText },
  statLabel: { fontSize: 12, marginTop: 2 },
  statLabelTickles: { color: C.amberText },
  statLabelLikes: { color: C.tealText },

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
