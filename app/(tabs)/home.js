import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor, moodColorFor, moodDotSize, textOn, lighten, withAlpha, TICKLE_NATURE_ICONS, NATURE_ORDER } from '../../lib/theme';
import { shareEntry, shareStatus, SHARE_CAPTIONS } from '../../lib/sharing';
import { isThisWeek, currentWeekStartISO, localDateString, DEFAULT_WEEK_START_DAY } from '../../lib/week';
import { flagEmoji } from '../../lib/country';
import Button from '../../components/Button';
import InitialsAvatar from '../../components/InitialsAvatar';
import AboutModal from '../../components/AboutModal';
import GoalTagModal from '../../components/GoalTagModal';
import ShareModal from '../../components/ShareModal';
import CornerNav from '../../components/CornerNav';
import WallpaperBackground from '../../components/WallpaperBackground';
import { requestReminderPermission, scheduleDailyReminder, cancelDailyReminder } from '../../lib/reminders';
import { isReviewAvailable, requestReview } from '../../lib/rateUs';

const PINNED_WINDOW_DAYS = 14;

// Labels for the self-care badge row's tap-to-reveal tooltip — mirrors
// create.js's TICKLE_NATURE_OPTIONS order (received, given, self).
const NATURE_LABELS = {
  received: 'Made me smile',
  given: 'I paid forward',
  self: 'Mood boost',
};

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
  let cursor = entryDates.has(localDateString(0)) ? 0 : 1;
  let streak = 0;
  while (entryDates.has(localDateString(cursor))) {
    streak++;
    cursor++;
  }
  return streak;
}

// True when the person just resumed after a gap: the streak has only
// just restarted (exactly 1 day) AND they have older entries predating
// it — the second condition is what distinguishes a real "coming back"
// from someone's very first-ever post, which would also compute a
// streak of 1 but has no history to have taken a gap from.
function computeReturnedFromGap(entries) {
  if (computeStreak(entries) !== 1) return false;
  const dates = entries.map((e) => e.entry_date);
  const mostRecent = dates.reduce((max, d) => (d > max ? d : max), dates[0]);
  return dates.some((d) => d < mostRecent);
}

export default function Home() {
  const { session, profile, refreshProfile } = useAuth();
  const accent = accentFor(profile?.accent_theme);
  const streakSunburstColor = withAlpha(lighten(accent.card, 0.5), 0.4);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [pickerEntryId, setPickerEntryId] = useState(null);
  const [shareEntryId, setShareEntryId] = useState(null);
  const [weeklyLikesGiven, setWeeklyLikesGiven] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [showRatePrompt, setShowRatePrompt] = useState(false);
  const [showReturnedMessage, setShowReturnedMessage] = useState(false);
  const returnedMessageShownRef = useRef(false);
  const [activeNatureTooltip, setActiveNatureTooltip] = useState(null);
  const natureTooltipTimerRef = useRef(null);

  // Auto-show the first-time intro exactly once, gated on the DB flag —
  // not local/session state, so it stays correctly "seen" across
  // reinstalls and devices. Shows AboutModal (not HomeGuide directly) —
  // AboutModal itself shows a static "you can revisit this anytime from
  // Settings" hint in this context (showGuideLink below), not a live
  // link into HomeGuide (an earlier tappable-link version hit a real
  // RN/Android overlapping-Modal-transition bug and was simplified away
  // rather than chased further). HomeGuide is separately reachable
  // anytime, ungated, from Settings ("How DayTickles works"), unchanged.
  useEffect(() => {
    if (profile && !profile.home_guide_seen) setShowGuide(true);
  }, [profile]);

  // Deliberately NOT DB-backed, unlike the guide above — plain
  // component state, reset every time Home mounts fresh. Simplest
  // version; revisit only if repeating on every app-reopen turns out to
  // actually bother people. The ref guards against re-triggering later
  // in the same mount if entries changes again (e.g. a new post nudges
  // the streak past 1).
  useEffect(() => {
    if (!returnedMessageShownRef.current && computeReturnedFromGap(entries)) {
      returnedMessageShownRef.current = true;
      setShowReturnedMessage(true);
    }
  }, [entries]);

  useEffect(() => {
    if (!showReturnedMessage) return;
    const timer = setTimeout(() => setShowReturnedMessage(false), 4000);
    return () => clearTimeout(timer);
  }, [showReturnedMessage]);

  // Reconciles the actually-scheduled OS notification with the
  // daily_reminder preference on every mount — covers cases where a
  // reinstall or OS-level cleanup cleared a previously scheduled
  // notification without the DB flag changing. Best-effort: native
  // scheduling errors here shouldn't affect anything else on Home.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        if (profile.daily_reminder) {
          const granted = await requestReminderPermission();
          if (granted) await scheduleDailyReminder();
        } else {
          await cancelDailyReminder();
        }
      } catch {
        // best-effort reconciliation only
      }
    })();
  }, [profile?.daily_reminder]);

  async function handleCloseAboutIntro() {
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
      .select('id, entry_date, text_content, mood, like_count, goal_id, tickle_nature, visibility, is_edited, created_at')
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

  const loadWeeklyLikesGiven = useCallback(async () => {
    if (!session) return;
    const { count, error } = await supabase
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('created_at', currentWeekStartISO(profile?.week_start_day ?? DEFAULT_WEEK_START_DAY));

    if (!error) setWeeklyLikesGiven(count || 0);
  }, [session, profile?.week_start_day]);

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
      loadWeeklyLikesGiven();
    }, [loadWeeklyLikesGiven])
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

  // Real DELETE, not a soft-hide — RLS already scopes it to entries you
  // own, and every table referencing tickle_entries (likes, favorites,
  // notifications, shares, etc.) cascades on delete (confirmed against
  // the schema before building this). Home and Feed each reload their
  // own entries on focus already, so a deletion made on one screen is
  // picked up by the other the next time it's revisited — no separate
  // cross-screen refresh mechanism needed.
  function confirmDeleteEntry(entry) {
    Alert.alert(
      'Delete this tickle?',
      "This can't be undone — it removes the entry everywhere, including any likes or shares.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteEntry(entry.id) },
      ]
    );
  }

  async function handleDeleteEntry(entryId) {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entryId));

    const { error } = await supabase.from('tickle_entries').delete().eq('id', entryId);
    if (error) setEntries(previous);
  }

  // Reversible, unlike delete, so no confirmation dialog — same
  // no-confirm treatment as follow/favorite/like. Going private just
  // means Everyone/Following's own visibility-filtered queries stop
  // matching this row next time they reload; Home and Mine never filter
  // on visibility, so they keep showing it either way.
  async function handleToggleVisibility(entry) {
    const newVisibility = entry.visibility === 'public' ? 'private' : 'public';
    const previous = entries;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, visibility: newVisibility } : e)));

    const { error } = await supabase
      .from('tickle_entries')
      .update({ visibility: newVisibility })
      .eq('id', entry.id);

    if (error) setEntries(previous);
  }

  // Same scroll-to-and-highlight mechanism notifications.js already
  // uses to jump into Feed's Mine tab at a specific entry.
  function goToEntryInFeed(entryId) {
    router.push({ pathname: '/feed', params: { tab: 'mine', highlightEntry: entryId } });
  }

  // Tapping the already-shown badge dismisses it early; tapping a
  // different badge replaces it. Either way it also auto-hides after a
  // couple seconds via the timer.
  function showNatureTooltip(key) {
    if (natureTooltipTimerRef.current) clearTimeout(natureTooltipTimerRef.current);
    if (activeNatureTooltip === key) {
      setActiveNatureTooltip(null);
      return;
    }
    setActiveNatureTooltip(key);
    natureTooltipTimerRef.current = setTimeout(() => setActiveNatureTooltip(null), 2000);
  }

  const totalTickles = entries.length;
  const weeklyEntries = entries.filter((e) => isThisWeek(e.entry_date, profile?.week_start_day ?? DEFAULT_WEEK_START_DAY));
  const weeklyTickles = weeklyEntries.length;

  // Milestone Rate-Us prompt (backlog #8) — flips true the moment it's
  // shown, not only on dismiss, so ignoring it never brings it back.
  // Same check-on-mount/flip-immediately shape as home_guide_seen above.
  useEffect(() => {
    if (profile && !profile.rate_prompt_seen && totalTickles >= 10) {
      setShowRatePrompt(true);
      supabase.from('profiles').update({ rate_prompt_seen: true }).eq('id', profile.id)
        .then(() => refreshProfile());
    }
  }, [profile, totalTickles]);

  async function handleRatePromptTap() {
    setShowRatePrompt(false);
    try {
      const available = await isReviewAvailable();
      if (available) await requestReview();
    } catch {
      // Native module may be unavailable on some builds — fail
      // silently, same as Settings' handleRateUs.
    }
  }

  const totalLikes = entries.reduce((sum, e) => sum + (e.like_count || 0), 0);
  const natureCounts = {
    received: weeklyEntries.filter((e) => e.tickle_nature === 'received').length,
    given: weeklyEntries.filter((e) => e.tickle_nature === 'given').length,
    self: weeklyEntries.filter((e) => e.tickle_nature === 'self').length,
  };

  const pinnedCutoff = localDateString(PINNED_WINDOW_DAYS - 1);
  const pinned = entries
    .filter((e) => e.entry_date >= pinnedCutoff)
    .reduce((best, e) => (!best || e.like_count > best.like_count ? e : best), null);

  function renderEntryBody(entry) {
    const taggedGoal = entry.goal_id ? goalsById[entry.goal_id] : null;
    const dotSize = moodDotSize(entry.mood);
    return (
      <View>
        <View style={styles.entryRow}>
          <View
            style={[
              styles.moodDot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: moodColorFor(entry.mood, accent),
              },
            ]}
          />
          <View style={styles.entryBody}>
            <Text style={styles.entryText} numberOfLines={1}>{entry.text_content}</Text>
            <View style={styles.entryMetaRow}>
              <Text style={styles.entryDate}>
                {formatEntryDate(entry.entry_date)}
                {entry.visibility === 'public' && entry.is_edited ? ' · (edited)' : ''}
              </Text>
              <Text style={styles.entryLikes}>{likeLabel(entry.like_count)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.iconRow}>
          {entry.tickle_nature && (
            <Ionicons
              name={TICKLE_NATURE_ICONS[entry.tickle_nature]}
              size={16}
              color={C.subtext}
              style={styles.natureIcon}
            />
          )}
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
          <TouchableOpacity
            onPress={() => setShareEntryId(entry.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.shareAction}
          >
            <Text style={styles.shareLink}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/create', params: { entryId: entry.id } })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.editAction}
          >
            <Ionicons name="pencil-outline" size={16} color={C.subtext} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleToggleVisibility(entry)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.visibilityAction}
          >
            <Ionicons
              name={entry.visibility === 'public' ? 'eye-outline' : 'eye-off-outline'}
              size={16}
              color={C.subtext}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => confirmDeleteEntry(entry)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.deleteAction}
          >
            <Ionicons name="trash-outline" size={16} color={C.rust} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const pickerEntry = entries.find((e) => e.id === pickerEntryId) || null;
  const shareTargetEntry = entries.find((e) => e.id === shareEntryId) || null;
  const shareStat = profile ? shareStatus(profile) : null;
  const shareBlocked = !!shareStat && !shareStat.unlimited && shareStat.remaining <= 0;

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
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>DayTickles</Text>
        <CornerNav style={styles.cornerNavInline} />
      </View>

      {profile && (
        <View style={styles.profileRow}>
          <InitialsAvatar username={profile.username} accentTheme={profile.accent_theme} size={20} />
          <Text style={styles.profileText}>
            {profile.username}{profile.country ? `  ${flagEmoji(profile.country)}` : ''}
          </Text>
        </View>
      )}

      {showReturnedMessage && (
        <TouchableOpacity
          style={styles.returnedBanner}
          activeOpacity={0.8}
          onPress={() => setShowReturnedMessage(false)}
        >
          <Text style={styles.returnedBannerText}>Welcome back — no pressure, just glad you're here</Text>
        </TouchableOpacity>
      )}

      {showRatePrompt && (
        <View style={styles.ratePromptBanner}>
          <Text style={styles.ratePromptText}>Enjoying DayTickles? A quick rating will help others.</Text>
          <View style={styles.ratePromptActions}>
            <TouchableOpacity onPress={handleRatePromptTap}>
              <Text style={styles.ratePromptRateText}>Rate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowRatePrompt(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={16} color={C.sparkleText} />
            </TouchableOpacity>
          </View>
        </View>
      )}

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

      <View style={styles.streakRow}>
        <View style={[styles.streakCard, { backgroundColor: accent.card }]}>
          <View style={[styles.streakSunburst, { backgroundColor: streakSunburstColor }]} />
          <Text style={[styles.streakNumber, { color: textOn(accent.card) }]}>{weeklyTickles}</Text>
          <Text style={[styles.streakLabel, { color: textOn(accent.card) }]}>Weekly Tickles</Text>
        </View>
        <View style={[styles.streakCard, { backgroundColor: accent.card }]}>
          <View style={[styles.streakSunburst, { backgroundColor: streakSunburstColor }]} />
          <Text style={[styles.streakNumber, { color: textOn(accent.card) }]}>{weeklyLikesGiven}</Text>
          <Text style={[styles.streakLabel, { color: textOn(accent.card) }]}>Weekly likes given</Text>
        </View>
      </View>

      <Text style={styles.weeklyVibesLabel}>Weekly Vibes</Text>
      <View style={styles.selfCareRow}>
        {NATURE_ORDER.map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.selfCareBadge}
            activeOpacity={0.7}
            onPress={() => showNatureTooltip(key)}
          >
            <Ionicons name={TICKLE_NATURE_ICONS[key]} size={16} color={C.subtext} />
            <Text style={styles.selfCareCount}>{natureCounts[key]}</Text>
            {activeNatureTooltip === key && (
              <View style={styles.natureTooltip} pointerEvents="none">
                <Text style={styles.natureTooltipText}>{NATURE_LABELS[key]}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Button title="New Tickle" onPress={() => router.push('/create')} variant="secondary" />

      {pinned && (
        <TouchableOpacity
          style={[styles.entryCard, styles.pinnedCard]}
          activeOpacity={0.8}
          onPress={() => goToEntryInFeed(pinned.id)}
        >
          <Text style={styles.pinnedLabel}>Most smiled with you the past 14 days</Text>
          {renderEntryBody(pinned)}
        </TouchableOpacity>
      )}

      {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

      {!loading && entries.length === 0 && (
        <Text style={styles.emptyText}>No tickles yet — write about what made you smile today.</Text>
      )}

      {/* Skip re-rendering the same entry twice -- pinned (highest
          like_count in the last 14 days) and entries[0] (the single most
          recent entry) frequently coincide, especially for newer/lower-
          activity accounts. */}
      {!loading && entries.length > 0 && entries[0].id !== pinned?.id && (
        <>
          <Text style={styles.sectionLabel}>Latest tickle</Text>
          <TouchableOpacity
            style={styles.entryCard}
            activeOpacity={0.8}
            onPress={() => goToEntryInFeed(entries[0].id)}
          >
            {renderEntryBody(entries[0])}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
    </WallpaperBackground>

    <GoalTagModal
      entry={pickerEntry}
      goals={goals}
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

    <AboutModal
      visible={showGuide}
      onClose={handleCloseAboutIntro}
      showGuideLink
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  // Cancels CornerNav's own marginBottom (meant for when it stands alone
  // at the top of Feed/Calendar/Tickle Pics) now that it's nested inside
  // titleRow -- titleRow's own marginBottom above already provides the
  // gap to profileRow below; without this the row would carry a double
  // margin and an uneven height between the title text and the icons.
  cornerNavInline: { marginBottom: 0 },
  title: { fontSize: 20, fontWeight: 'bold', color: C.rustDark, flexShrink: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  profileText: { fontSize: 16, color: C.text },
  returnedBanner: {
    backgroundColor: C.sparkleBg, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12,
  },
  returnedBannerText: { fontSize: 14, fontWeight: '600', color: C.sparkleText, textAlign: 'center' },
  ratePromptBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.sparkleBg, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12,
  },
  ratePromptText: { flex: 1, fontSize: 14, fontWeight: '600', color: C.sparkleText, marginRight: 12 },
  ratePromptActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ratePromptRateText: { fontSize: 14, fontWeight: '700', color: C.sparkleText },

  streakRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  streakCard: {
    flex: 1, borderRadius: 18, paddingVertical: 10,
    alignItems: 'center', overflow: 'hidden',
  },
  streakSunburst: {
    position: 'absolute', top: -30, right: -30,
    width: 90, height: 90, borderRadius: 45,
  },
  streakNumber: { fontSize: 24, fontWeight: 'bold' },
  streakLabel: { fontSize: 14, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1, borderRadius: 18,
    paddingVertical: 12, alignItems: 'center',
  },
  statCardTickles: { backgroundColor: C.amberBg },
  statCardLikes: { backgroundColor: C.teal },
  statNumber: { fontSize: 24, fontWeight: 'bold' },
  statNumberTickles: { color: C.amberText },
  statNumberLikes: { color: C.tealText },
  statLabel: { fontSize: 12, marginTop: 2 },
  statLabelTickles: { color: C.amberText },
  statLabelLikes: { color: C.tealText },

  weeklyVibesLabel: {
    fontSize: 12, fontWeight: '600', color: C.subtext, textAlign: 'center',
    marginTop: 4, marginBottom: 8,
  },
  selfCareRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 12,
    marginBottom: 10,
  },
  selfCareBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  selfCareCount: { fontSize: 13, fontWeight: '600', color: C.text },
  natureTooltip: {
    position: 'absolute', top: -34, left: -40, right: -40,
    alignItems: 'center',
  },
  natureTooltipText: {
    fontSize: 11, fontWeight: '600', color: C.bg,
    backgroundColor: C.rustDark, borderRadius: 8, overflow: 'hidden',
    paddingVertical: 4, paddingHorizontal: 10,
  },

  pinnedCard: {
    marginTop: 12, borderWidth: 1.5, borderColor: C.amberDark, backgroundColor: C.sparkleBg,
  },
  pinnedLabel: {
    fontSize: 12, fontWeight: '600', color: C.sparkleText,
    marginBottom: 8,
  },

  sectionLabel: { fontSize: 14, fontWeight: '600', color: C.subtext, marginTop: 6, marginBottom: 6 },
  loader: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 12 },

  entryCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 10, marginBottom: 12,
  },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  moodDot: { marginRight: 12, marginTop: 4 },
  entryBody: { flex: 1 },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },
  entryMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 8,
  },
  entryDate: { fontSize: 12, color: C.subtext },
  entryLikes: { fontSize: 12, color: C.teal, fontWeight: '600' },
  shareLink: { fontSize: 12, color: C.subtext, fontWeight: '600' },

  iconRow: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8,
  },
  natureIcon: { marginLeft: 12 },
  goalDot: { width: 16, height: 16, borderRadius: 8, marginLeft: 12 },
  shareAction: { marginLeft: 12 },
  editAction: { marginLeft: 12 },
  visibilityAction: { marginLeft: 12 },
  deleteAction: { marginLeft: 12 },
  goalDotEmpty: {
    backgroundColor: 'transparent', borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: C.faint,
  },
});
