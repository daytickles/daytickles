import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, darken, textOn, TICKLE_NATURE_ICONS } from '../lib/theme';
import { shareEntry, shareStatus, SHARE_CAPTIONS } from '../lib/sharing';
import GoalTagModal from '../components/GoalTagModal';
import ShareModal from '../components/ShareModal';
import PhotoEnlargeModal from '../components/PhotoEnlargeModal';
import EntryCard from '../components/EntryCard';
import {
  initPinBoardDb, getAllLinkedEntryIds, getPhotoForEntry, getPinnedPhotoDatesInRange,
} from '../lib/pinBoardDb';
import { useShareCard } from '../lib/useShareCard';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Fixed display order for Tickle Vibes' per-day icon row -- Set
// iteration would otherwise follow query result order (arbitrary,
// since loadMonth has no ORDER BY), making icons jump around between
// days rather than always reading sunny/heart/leaf left to right.
const NATURE_ORDER = ['received', 'given', 'self'];

const ENTRY_SELECT =
  'id, entry_date, text_content, mood, like_count, tickle_nature, goal_id, visibility, is_edited, created_at, user_id, profiles!tickle_entries_user_id_fkey(username, avatar_emoji, accent_theme, country)';

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoDate(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export default function Calendar() {
  const { session, profile, refreshProfile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const accentDarkText = textOn(accentDark);
  // Selected-day-cell background is the person's actual accent color,
  // not the darkened shade above (accentDark/accentDarkText stay as-is
  // for the Tickles/Tickle Vibes toggle pill and the unselected "today"
  // label, neither of which has this contrast issue) -- accentCardText
  // is the correct-contrast color for anything drawn on top of it.
  const accentCard = accentFor(profile?.accent_theme).card;
  const accentCardText = textOn(accentCard);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [countsByDate, setCountsByDate] = useState({});
  const [natureCategoriesByDate, setNatureCategoriesByDate] = useState({});
  const [goalIdsByDate, setGoalIdsByDate] = useState({});
  const [viewMode, setViewMode] = useState('numbers');
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(null);
  const [dayEntries, setDayEntries] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);

  const [goals, setGoals] = useState([]);
  const [pickerEntryId, setPickerEntryId] = useState(null);
  const [shareEntryId, setShareEntryId] = useState(null);
  const [favoritedIds, setFavoritedIds] = useState(new Set());
  const [photoLinkedIds, setPhotoLinkedIds] = useState(new Set());
  const [photoDatesInMonth, setPhotoDatesInMonth] = useState(new Set());
  const [enlargeUri, setEnlargeUri] = useState(null);
  const { hiddenCard, captureCard } = useShareCard();

  const loadGoals = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setGoals(data || []);
  }, [session]);

  const loadFavorited = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('favorites')
      .select('entry_id')
      .eq('user_id', session.user.id);
    if (!error) setFavoritedIds(new Set((data || []).map((f) => f.entry_id)));
  }, [session]);

  // Month-grid dots only need id + entry_date (+ tickle_nature, for
  // Vibes' per-day category icons, + goal_id for Goals' per-day color
  // dots) — the full ENTRY_SELECT payload is fetched separately, per
  // day, only once a day is tapped.
  // Same (user_id, entry_date) shape as idx_entries_user_date, so adding
  // these columns to the select list stays within the same indexed
  // range scan rather than costing a second round-trip.
  const loadMonth = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const start = isoDate(viewYear, viewMonth, 1);
    const end = isoDate(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());

    const { data, error } = await supabase
      .from('tickle_entries')
      .select('id, entry_date, tickle_nature, goal_id')
      .eq('user_id', session.user.id)
      .gte('entry_date', start)
      .lte('entry_date', end);

    if (!error) {
      const counts = {};
      const natureCategories = {};
      const goalIds = {};
      (data || []).forEach((e) => {
        counts[e.entry_date] = (counts[e.entry_date] || 0) + 1;
        // day_journal (and null) entries have no TICKLE_NATURE_ICONS
        // entry -- only the three real nature categories earn a badge.
        if (TICKLE_NATURE_ICONS[e.tickle_nature]) {
          if (!natureCategories[e.entry_date]) natureCategories[e.entry_date] = new Set();
          natureCategories[e.entry_date].add(e.tickle_nature);
        }
        if (e.goal_id) {
          if (!goalIds[e.entry_date]) goalIds[e.entry_date] = new Set();
          goalIds[e.entry_date].add(e.goal_id);
        }
      });
      setCountsByDate(counts);
      setNatureCategoriesByDate(natureCategories);
      setGoalIdsByDate(goalIds);
    }
    setLoading(false);
  }, [session, viewYear, viewMonth]);

  // Same init-before-query shape as pinboard.js's loadBoard, so Calendar's
  // local Pin Board queries work even if this screen is opened before the
  // Pin Board tables have ever been created. Both queries share the same
  // visible-month range loadMonth already computes for the tickle counts.
  const loadPinBoardData = useCallback(async () => {
    if (!session) return;
    await initPinBoardDb(session.user.id);
    const start = isoDate(viewYear, viewMonth, 1);
    const end = isoDate(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());
    const [linkedIds, photoDates] = await Promise.all([
      getAllLinkedEntryIds(session.user.id),
      getPinnedPhotoDatesInRange(session.user.id, start, end),
    ]);
    setPhotoLinkedIds(new Set(linkedIds));
    setPhotoDatesInMonth(new Set(photoDates));
  }, [session, viewYear, viewMonth]);

  useFocusEffect(useCallback(() => { loadGoals(); }, [loadGoals]));
  useFocusEffect(useCallback(() => { loadFavorited(); }, [loadFavorited]));
  useFocusEffect(useCallback(() => { loadMonth(); }, [loadMonth]));
  useFocusEffect(useCallback(() => { loadPinBoardData(); }, [loadPinBoardData]));

  async function handleOpenPhoto(entryId) {
    const photo = await getPhotoForEntry(session.user.id, entryId);
    if (photo) setEnlargeUri(photo.file_path);
  }

  const loadDayEntries = useCallback(
    async (dateStr) => {
      if (!session) return;
      setDayLoading(true);
      const { data, error } = await supabase
        .from('tickle_entries')
        .select(ENTRY_SELECT)
        .eq('user_id', session.user.id)
        .eq('entry_date', dateStr)
        .order('created_at', { ascending: false });
      if (!error) setDayEntries(data || []);
      setDayLoading(false);
    },
    [session]
  );

  function selectDate(dateStr) {
    setSelectedDate(dateStr);
    loadDayEntries(dateStr);
  }

  function goToMonth(delta) {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month < 0) {
      month = 11;
      year -= 1;
    } else if (month > 11) {
      month = 0;
      year += 1;
    }
    setViewMonth(month);
    setViewYear(year);
    setSelectedDate(null);
    setDayEntries([]);
  }

  const goalsById = Object.fromEntries(goals.map((g) => [g.id, g]));
  // Achieved goals are never offered as a new tag target in the picker
  // — they only ever appear read-only, on entries already tagged before
  // achievement (resolved via goalsById above, achieved or not).
  const activeGoals = goals.filter((g) => !g.achieved_at);

  async function handleToggleFavorite(entryId) {
    const isFavorited = favoritedIds.has(entryId);
    const previous = favoritedIds;

    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (isFavorited) next.delete(entryId);
      else next.add(entryId);
      return next;
    });

    const { error } = isFavorited
      ? await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('entry_id', entryId)
      : await supabase.from('favorites').insert({ user_id: session.user.id, entry_id: entryId });

    if (error) setFavoritedIds(previous);
  }

  async function handleToggleVisibility(entry) {
    const newVisibility = entry.visibility === 'public' ? 'private' : 'public';
    const previous = dayEntries;
    setDayEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, visibility: newVisibility } : e)));

    const { error } = await supabase
      .from('tickle_entries')
      .update({ visibility: newVisibility })
      .eq('id', entry.id);

    if (error) setDayEntries(previous);
  }

  async function handleDeleteEntry(entryId) {
    const previous = dayEntries;
    setDayEntries((prev) => prev.filter((e) => e.id !== entryId));

    const { error } = await supabase.from('tickle_entries').delete().eq('id', entryId);
    if (error) {
      setDayEntries(previous);
      return;
    }

    // Keep the month grid's dot/count in sync without a full reload.
    setCountsByDate((prev) => {
      if (!selectedDate || !prev[selectedDate]) return prev;
      const next = { ...prev };
      const remaining = next[selectedDate] - 1;
      if (remaining <= 0) delete next[selectedDate];
      else next[selectedDate] = remaining;
      return next;
    });
  }

  async function assignGoal(entryId, goalId) {
    const previous = dayEntries;
    setDayEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, goal_id: goalId } : e)));
    setPickerEntryId(null);

    const { error } = await supabase
      .from('tickle_entries')
      .update({ goal_id: goalId })
      .eq('id', entryId);

    if (error) setDayEntries(previous);
  }

  async function handleShare(entry, captionId) {
    setShareEntryId(null);
    const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);
    const photo = await getPhotoForEntry(session.user.id, entry.id);

    let cardImageUri;
    if (photo) {
      try {
        cardImageUri = await captureCard({
          photo,
          captionLabel: caption.label,
          accentColor: accentFor(profile?.accent_theme).card,
        });
      } catch (err) {
        // Falls back to the text-only share below rather than blocking
        // the share outright — capture failure shouldn't cost the person
        // their share.
        console.error('handleShare: card capture failed, falling back to text share', err);
      }
    }

    await shareEntry({ profile, entry, captionId, onProfileUpdated: refreshProfile, cardImageUri });
  }

  // Vibes / Goals each show only entries matching their own tag test
  // (nature category / goal_id truthiness) -- the same tests loadMonth
  // already uses to decide which days earn a grid badge, so a day that
  // shows any badge is guaranteed to have at least one visible entry
  // here.
  // Client-side filter on already-fetched data, not a new query -- a
  // single day's entries are a small dataset.
  const visibleDayEntries =
    viewMode === 'vibes'
      ? dayEntries.filter((e) => TICKLE_NATURE_ICONS[e.tickle_nature])
      : viewMode === 'goals'
      ? dayEntries.filter((e) => e.goal_id)
      : dayEntries;
  // Distinguishes a genuinely empty day from one where entries exist but
  // none match the active tab's tag -- "No tickles logged" would be
  // misleading in that case, since the person did log something that day.
  const emptyDayText =
    dayEntries.length > 0 && visibleDayEntries.length === 0
      ? viewMode === 'vibes'
        ? 'No Vibes entries this day.'
        : 'No goal-tagged entries this day.'
      : 'No tickles logged this day.';

  const pickerEntry = dayEntries.find((e) => e.id === pickerEntryId) || null;
  const shareTargetEntry = dayEntries.find((e) => e.id === shareEntryId) || null;
  const shareStat = profile ? shareStatus(profile) : null;
  const shareBlocked = !!shareStat && !shareStat.unlimited && shareStat.remaining <= 0;

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const todayStr = isoDate(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Calendar</Text>

        <View style={styles.monthNavRow}>
          <TouchableOpacity onPress={() => goToMonth(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={C.subtext} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => goToMonth(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-forward" size={22} color={C.subtext} />
          </TouchableOpacity>
        </View>

        <View style={styles.viewModeRow}>
          {['numbers', 'vibes', 'goals'].map((mode) => {
            const selected = viewMode === mode;
            const label = mode === 'numbers' ? 'Tickles' : mode === 'vibes' ? 'Vibes' : 'Goals';
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => setViewMode(mode)}
                style={[styles.viewModeOption, selected && { backgroundColor: accentDark, borderColor: accentDark }]}
              >
                <Text style={[styles.viewModeOptionLabel, selected && { color: accentDarkText }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>{label}</Text>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator color={C.rust} style={styles.loader} />
          ) : (
            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={i} style={styles.dayCell} />;

                const dateStr = isoDate(viewYear, viewMonth, day);
                const count = countsByDate[dateStr] || 0;
                const hasPhoto = photoDatesInMonth.has(dateStr);
                const isSelected = selectedDate === dateStr;
                const isToday = dateStr === todayStr;

                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayCell, isSelected && { backgroundColor: accentCard }]}
                    onPress={() => selectDate(dateStr)}
                  >
                    {hasPhoto && (
                      <View style={styles.photoBadge}>
                        <Ionicons name="camera-outline" size={9} color={isSelected ? accentCardText : C.subtext} />
                      </View>
                    )}
                    <Text
                      style={[
                        styles.dayLabel,
                        isToday && !isSelected && { color: accentDark, fontWeight: '700' },
                        isSelected && { color: accentCardText },
                      ]}
                    >
                      {day}
                    </Text>
                    {viewMode === 'vibes' ? (
                      <View style={styles.vibesIconRow}>
                        {NATURE_ORDER.filter((nature) => natureCategoriesByDate[dateStr]?.has(nature)).map(
                          (nature) => (
                            <Ionicons
                              key={nature}
                              name={TICKLE_NATURE_ICONS[nature]}
                              size={9}
                              color={isSelected ? accentCardText : accentDark}
                            />
                          )
                        )}
                      </View>
                    ) : viewMode === 'goals' ? (
                      <View style={styles.goalsDotRow}>
                        {goals
                          .filter((g) => goalIdsByDate[dateStr]?.has(g.id))
                          .map((g) => (
                            <View key={g.id} style={[styles.goalDayDot, { backgroundColor: g.color }]} />
                          ))}
                      </View>
                    ) : (
                      <View style={[styles.countBadge, count === 0 && styles.countBadgeEmpty]}>
                        {count > 0 && <Text style={styles.countBadgeText}>{count > 9 ? '9+' : count}</Text>}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {selectedDate && (
          <View style={styles.dayEntriesSection}>
            <Text style={styles.dayEntriesTitle}>
              {new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </Text>
            {dayLoading ? (
              <ActivityIndicator color={C.rust} style={styles.loader} />
            ) : visibleDayEntries.length === 0 ? (
              <Text style={styles.emptyText}>{emptyDayText}</Text>
            ) : (
              visibleDayEntries.map((item) => (
                <EntryCard
                  key={item.id}
                  item={item}
                  currentUserId={session.user.id}
                  showMineActions
                  isHighlighted={false}
                  isFollowing={false}
                  isFavorited={favoritedIds.has(item.id)}
                  isLiked={false}
                  taggedGoal={item.goal_id ? goalsById[item.goal_id] : null}
                  hasLinkedPhoto={photoLinkedIds.has(item.id)}
                  onOpenPhoto={handleOpenPhoto}
                  onPickGoal={setPickerEntryId}
                  onShare={setShareEntryId}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleVisibility={handleToggleVisibility}
                  onDelete={(entry) => handleDeleteEntry(entry.id)}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      <GoalTagModal
        entry={pickerEntry}
        goals={activeGoals}
        taggedGoal={pickerEntry?.goal_id ? goalsById[pickerEntry.goal_id] : null}
        onAssign={(goalId) => assignGoal(pickerEntry.id, goalId)}
        onDismiss={() => setPickerEntryId(null)}
      />

      <ShareModal
        visible={shareTargetEntry}
        captions={SHARE_CAPTIONS}
        blocked={shareBlocked}
        cap={shareStat?.cap}
        onConfirm={(captionId) => handleShare(shareTargetEntry, captionId)}
        onDismiss={() => setShareEntryId(null)}
      />

      <PhotoEnlargeModal uri={enlargeUri} onDismiss={() => setEnlargeUri(null)} />
      {hiddenCard}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 16 },

  monthNavRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  monthLabel: { fontSize: 16, fontWeight: '700', color: C.rustDark },

  viewModeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  viewModeOption: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  viewModeOptionLabel: { fontSize: 12, fontWeight: '600', color: C.subtext },

  calendarCard: {
    backgroundColor: C.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayLabel: {
    width: '14.28%', textAlign: 'center', fontSize: 12, fontWeight: '600', color: C.subtext,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%', aspectRatio: 1, borderRadius: 8, position: 'relative',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  photoBadge: { position: 'absolute', top: 2, right: 4 },
  dayLabel: { fontSize: 14, color: C.text },
  countBadge: {
    minWidth: 16, height: 16, borderRadius: 8, marginTop: 2,
    backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  countBadgeEmpty: {
    backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.faint,
  },
  countBadgeText: { fontSize: 10, fontWeight: '700', color: C.bg },
  // Fixed height matches countBadge's own 16px so the day number doesn't
  // shift vertically between a day with 0 vs. up to 3 icons (dayCell
  // centers its content) -- an empty day is just blank space at the
  // same height, not a placeholder glyph.
  vibesIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 16, marginTop: 2 },
  // Same fixed 16px height/margin as vibesIconRow, for the same reason
  // -- keeps the day number from shifting vertically when switching
  // between Tickles/Vibes/Goals tabs.
  goalsDotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 16, marginTop: 2 },
  goalDayDot: { width: 7, height: 7, borderRadius: 3.5 },

  loader: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 12 },

  dayEntriesSection: { marginTop: 20 },
  dayEntriesTitle: { fontSize: 16, fontWeight: '700', color: C.rustDark, marginBottom: 10 },
});
