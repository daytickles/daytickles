import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor, SAVED_ENTRY_DOT_SIZE, withAlpha, NATURE_ORDER, VIBE_COLORS } from '../../lib/theme';
import { shareEntry, shareStatus, SHARE_CAPTIONS } from '../../lib/sharing';
import { isThisWeek, isThisMonth, localDateString, DEFAULT_WEEK_START_DAY } from '../../lib/week';
import { fetchFoundingMemberPaceStatus } from '../../lib/foundingMember';
import { flagEmoji } from '../../lib/country';
import Button from '../../components/Button';
import VibeCard from '../../components/VibeCard';
import NatureIcon from '../../components/NatureIcon';
import InitialsAvatar from '../../components/InitialsAvatar';
import AboutModal from '../../components/AboutModal';
import FoundingMemberBadge from '../../components/FoundingMemberBadge';
import GoalTagModal from '../../components/GoalTagModal';
import QuickStartCard from '../../components/QuickStartCard';
import ShareModal from '../../components/ShareModal';
import CornerNav from '../../components/CornerNav';
import WallpaperBackground from '../../components/WallpaperBackground';
import {
  requestReminderPermission,
  scheduleDailyReminder,
  cancelDailyReminder,
  regenerateAwarenessCueSchedule,
  cancelAwarenessCueSchedule,
} from '../../lib/reminders';
import { isReviewAvailable, requestReview } from '../../lib/rateUs';

const PINNED_WINDOW_DAYS = 14;

// Labels rendered below each Vibe card — mirrors create.js's
// TICKLE_NATURE_OPTIONS order (received, given, self).
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

// "A" / "A and B" / "A, B, and C" -- for naming the specific lagging
// Founding Member requirements in the pace-reminder banner rather than
// a vague "check in" message.
function joinLabels(labels) {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
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
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [pickerEntryId, setPickerEntryId] = useState(null);
  const [shareEntryId, setShareEntryId] = useState(null);
  const [sharesTotal, setSharesTotal] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [showRatePrompt, setShowRatePrompt] = useState(false);
  const [showReturnedMessage, setShowReturnedMessage] = useState(false);
  const returnedMessageShownRef = useRef(false);
  const [activeStatTooltip, setActiveStatTooltip] = useState(null);
  const statTooltipTimerRef = useRef(null);
  const [activeVibeTooltip, setActiveVibeTooltip] = useState(null);
  const vibeTooltipTimerRef = useRef(null);
  const [paceReminder, setPaceReminder] = useState(null);

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

  // Regenerates today's random Awareness Cue schedule at most once per
  // local calendar day, gated by awareness_cue_schedule_generated_on --
  // unlike the daily reminder's fixed DAILY trigger above (safely
  // idempotent to re-schedule), Awareness Cue's times are freshly
  // randomized each day, so "already generated today" has to be
  // tracked explicitly. Deliberately the only place that ever calls
  // regenerateAwarenessCueSchedule/cancelAwarenessCueSchedule -- unlike
  // the daily reminder, Settings' own Awareness Cue handlers only write
  // preference columns, never call the scheduler directly, to avoid the
  // known duplicate-native-call race documented on the daily-reminder
  // effect above (banked backlog #29). Accepted limitation (per spec):
  // a day the user never opens the app gets no cues that day.
  useEffect(() => {
    if (!profile) return;
    const today = localDateString(0);

    if (!profile.awareness_cue_enabled) {
      if (profile.awareness_cue_schedule_generated_on) {
        (async () => {
          try {
            await cancelAwarenessCueSchedule();
            await supabase
              .from('profiles')
              .update({ awareness_cue_schedule_generated_on: null })
              .eq('id', profile.id);
            refreshProfile();
          } catch {
            // best-effort reconciliation only
          }
        })();
      }
      return;
    }

    if (profile.awareness_cue_schedule_generated_on === today) return;

    (async () => {
      try {
        const granted = await requestReminderPermission();
        if (!granted) return;
        await regenerateAwarenessCueSchedule({
          type: profile.awareness_cue_type,
          frequencyMode: profile.awareness_cue_frequency_mode,
          count: profile.awareness_cue_count,
          windowStartMinute: profile.awareness_cue_window_start_minute,
          windowEndMinute: profile.awareness_cue_window_end_minute,
        });
        await supabase
          .from('profiles')
          .update({ awareness_cue_schedule_generated_on: today })
          .eq('id', profile.id);
        refreshProfile();
      } catch {
        // best-effort reconciliation only
      }
    })();
  }, [
    profile?.awareness_cue_enabled,
    profile?.awareness_cue_type,
    profile?.awareness_cue_frequency_mode,
    profile?.awareness_cue_count,
    profile?.awareness_cue_window_start_minute,
    profile?.awareness_cue_window_end_minute,
    profile?.awareness_cue_schedule_generated_on,
  ]);

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
      .select('id, entry_date, text_content, like_count, goal_id, tickle_nature, visibility, is_edited, created_at')
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

  // All-time total, cloud-only -- tickle_shares (entry shares) +
  // photo_share_events (bare Pin Board photo shares), same combined
  // definition the Founding Member month-progress RPC uses (migration
  // 0023). Deliberately NOT lib/pinBoardDb.js's local-only photo_shares
  // table -- that's device-local and wouldn't survive a reinstall or a
  // second device, which would make an "all-time" total silently wrong.
  const loadSharesTotal = useCallback(async () => {
    if (!session) return;
    const [tickleSharesResult, photoShareEventsResult] = await Promise.all([
      supabase.from('tickle_shares').select('id', { count: 'exact', head: true }).eq('created_by', session.user.id),
      supabase.from('photo_share_events').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
    ]);
    const tickleSharesCount = tickleSharesResult.error ? 0 : (tickleSharesResult.count || 0);
    const photoShareEventsCount = photoShareEventsResult.error ? 0 : (photoShareEventsResult.count || 0);
    setSharesTotal(tickleSharesCount + photoShareEventsCount);
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
      loadSharesTotal();
    }, [loadSharesTotal])
  );

  // Read-only (see fetchFoundingMemberPaceStatus) so it's fine to run
  // on every Home focus, same as the loaders above -- deliberately
  // separate from advanceFoundingMemberProgress (founding-member.js's
  // own loader), which does real evaluation/reservation side effects
  // that don't belong on Home's most-visited-screen cadence.
  const loadPaceReminder = useCallback(async () => {
    if (!session) return;
    if (!profile || profile.founding_member_taking_part === false || profile.founding_member_reminders_enabled === false) {
      setPaceReminder(null);
      return;
    }
    try {
      setPaceReminder(await fetchFoundingMemberPaceStatus(session.user.id));
    } catch {
      // Best-effort -- a failed pace-status fetch shouldn't block Home.
      setPaceReminder(null);
    }
  }, [session, profile]);

  useFocusEffect(
    useCallback(() => {
      loadPaceReminder();
    }, [loadPaceReminder])
  );

  const goalsById = Object.fromEntries(goals.map((g) => [g.id, g]));
  // Achieved goals are never offered as a new tag target in the picker
  // — they only ever appear read-only, on entries already tagged before
  // achievement (resolved via goalsById above, achieved or not). Same
  // filtering feed.js/calendar.js already apply before their own
  // GoalTagModal calls -- Home's own call was missing it.
  const activeGoals = goals.filter((g) => !g.achieved_at);

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

  // Same tap-to-show/auto-hide-after-2s mechanism the old self-care
  // badge row used (showNatureTooltip, removed during this redesign) --
  // now applied to the Tickles/Likes/Shares stat pills instead. Tapping
  // the already-shown pill dismisses it early; tapping a different pill
  // replaces it.
  function showStatTooltip(key) {
    if (statTooltipTimerRef.current) clearTimeout(statTooltipTimerRef.current);
    if (activeStatTooltip === key) {
      setActiveStatTooltip(null);
      return;
    }
    setActiveStatTooltip(key);
    statTooltipTimerRef.current = setTimeout(() => setActiveStatTooltip(null), 2000);
  }

  // Same tap-to-show/tap-again-to-dismiss/auto-hide-after-2s mechanism
  // as showStatTooltip above (and the pre-redesign self-care badges) --
  // applied to the Vibe cards instead. One shared tooltip explains the
  // three stacked numbers' position, so this only needs to track WHICH
  // card's tooltip is open, not separate per-vibe tooltip text.
  function showVibeTooltip(key) {
    if (vibeTooltipTimerRef.current) clearTimeout(vibeTooltipTimerRef.current);
    if (activeVibeTooltip === key) {
      setActiveVibeTooltip(null);
      return;
    }
    setActiveVibeTooltip(key);
    vibeTooltipTimerRef.current = setTimeout(() => setActiveVibeTooltip(null), 2000);
  }

  const totalTickles = entries.length;

  // Single pass over the full (already-loaded, unfiltered) entries
  // history -- no new query needed for this, since home.js already
  // loads every entry the user has ever written. Four windows at once
  // per vibe: this week / this month / all-time (the vibe card's three
  // stacked numbers) and today (the lightbulb's lit/unlit check).
  const todayDateForVibes = localDateString(0);
  const vibeWeekCounts = { received: 0, given: 0, self: 0 };
  const vibeMonthCounts = { received: 0, given: 0, self: 0 };
  const vibeAllTimeCounts = { received: 0, given: 0, self: 0 };
  const vibeTodayCounts = { received: 0, given: 0, self: 0 };
  for (const e of entries) {
    const nature = e.tickle_nature;
    if (!nature || !(nature in vibeAllTimeCounts)) continue;
    vibeAllTimeCounts[nature]++;
    if (isThisWeek(e.entry_date, profile?.week_start_day ?? DEFAULT_WEEK_START_DAY)) vibeWeekCounts[nature]++;
    if (isThisMonth(e.entry_date)) vibeMonthCounts[nature]++;
    if (e.entry_date === todayDateForVibes) vibeTodayCounts[nature]++;
  }

  // null/0 daily_goal_<vibe> both mean "no goal set" -- that vibe's
  // bulb never lights, distinct from a goal that's merely not yet met.
  function isVibeLit(key) {
    const target = profile?.[`daily_goal_${key}`];
    if (!target) return false;
    return vibeTodayCounts[key] >= target;
  }

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

  // Window is [midpoint, end) -- doesn't linger into a month that's
  // technically over but not yet evaluated by a visit to the FM page
  // (advanceFoundingMemberProgress only runs there, not on Home).
  // dismissed_at is compared against the window's own start, not just
  // "any dismissal ever", so a dismissal from a prior month never
  // suppresses this month's reminder -- see 0036's column comment.
  let showPaceReminder = false;
  let paceReminderText = '';
  if (paceReminder && paceReminder.laggingRequirements.length > 0) {
    const startMs = new Date(paceReminder.window.startISO).getTime();
    const endMs = new Date(paceReminder.window.endISOExclusive).getTime();
    const midMs = (startMs + endMs) / 2;
    const nowMs = Date.now();
    const dismissedMs = profile?.founding_member_reminder_dismissed_at
      ? new Date(profile.founding_member_reminder_dismissed_at).getTime()
      : 0;
    showPaceReminder = nowMs >= midMs && nowMs < endMs && dismissedMs < startMs;
    if (showPaceReminder) {
      paceReminderText = `You're a bit behind on ${joinLabels(paceReminder.laggingRequirements.map((r) => r.label))} this month.`;
    }
  }

  async function handleDismissPaceReminder() {
    setPaceReminder(null);
    await supabase
      .from('profiles')
      .update({ founding_member_reminder_dismissed_at: new Date().toISOString() })
      .eq('id', session.user.id);
    refreshProfile();
  }

  // Permanent, unlike handleDismissPaceReminder above -- no window to
  // re-arm against, see quick_start_dismissed's column comment
  // (migration 0038).
  async function handleDismissQuickStart() {
    await supabase
      .from('profiles')
      .update({ quick_start_dismissed: true })
      .eq('id', session.user.id);
    refreshProfile();
  }

  const totalLikes = entries.reduce((sum, e) => sum + (e.like_count || 0), 0);

  // Day Journal entries are private/reflective by design -- excluded
  // from both spotlight picks below, same intent as their exclusion
  // from the vibe counts above. totalTickles/totalLikes above still
  // count them; only "what gets surfaced" is filtered here.
  const spotlightEntries = entries.filter((e) => e.tickle_nature !== 'day_journal');

  const pinnedCutoff = localDateString(PINNED_WINDOW_DAYS - 1);
  const pinned = spotlightEntries
    .filter((e) => e.entry_date >= pinnedCutoff && e.like_count > 0)
    .reduce((best, e) => (!best || e.like_count > best.like_count ? e : best), null);

  function renderEntryBody(entry) {
    const taggedGoal = entry.goal_id ? goalsById[entry.goal_id] : null;
    return (
      <View>
        <View style={styles.entryRow}>
          {/* The plain-grey NatureIcon that used to render in iconRow
              below was removed -- it duplicated this colored vibe icon.
              Day Journal entries never reach renderEntryBody
              (spotlightEntries already excludes tickle_nature ===
              'day_journal'), so there's no journal-icon case to
              preserve here, unlike EntryCard.js's iconGroup. */}
          <View
            style={[
              styles.vibeIconSlot,
              {
                width: SAVED_ENTRY_DOT_SIZE,
                height: SAVED_ENTRY_DOT_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            {!!VIBE_COLORS[entry.tickle_nature] && (
              <NatureIcon
                nature={entry.tickle_nature}
                size={SAVED_ENTRY_DOT_SIZE}
                color={VIBE_COLORS[entry.tickle_nature]}
              />
            )}
          </View>
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

  const STAT_PILLS = [
    { key: 'tickles', icon: 'create-outline', value: totalTickles, tooltip: "Tickles you've written, all-time" },
    { key: 'likes', icon: 'thumbs-up-outline', value: totalLikes, tooltip: "Likes you've received, all-time" },
    { key: 'shares', icon: 'share-social-outline', value: sharesTotal, tooltip: "Tickles and photos you've shared, all-time" },
  ];

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
          {!!profile.founding_member_number && (
            <FoundingMemberBadge number={profile.founding_member_number} />
          )}
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

      {showPaceReminder && (
        <View style={styles.paceReminderBanner}>
          <MaterialCommunityIcons name="crown-outline" size={18} color={C.sparkleText} style={styles.paceReminderIcon} />
          <Text style={styles.ratePromptText}>
            Halfway through the month — a little nudge to check in on your Founding Member progress. {paceReminderText}
          </Text>
          <TouchableOpacity
            onPress={handleDismissPaceReminder}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color={C.sparkleText} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.vibeCardsRow}>
        {NATURE_ORDER.map((key) => (
          <VibeCard
            key={key}
            nature={key}
            color={VIBE_COLORS[key]}
            lit={isVibeLit(key)}
            accentColor={accent.card}
            weekCount={vibeWeekCounts[key]}
            monthCount={vibeMonthCounts[key]}
            allTimeCount={vibeAllTimeCounts[key]}
            showTooltip={activeVibeTooltip === key}
            onPress={() => showVibeTooltip(key)}
          />
        ))}
      </View>
      <View style={styles.vibeLabelsRow}>
        {NATURE_ORDER.map((key) => (
          <Text key={key} style={styles.vibeLabel} numberOfLines={1}>{NATURE_LABELS[key]}</Text>
        ))}
      </View>

      <View style={styles.statPillsRow}>
        {STAT_PILLS.map((pill) => (
          <TouchableOpacity
            key={pill.key}
            style={[styles.statPill, { borderColor: accent.card }]}
            activeOpacity={0.7}
            onPress={() => showStatTooltip(pill.key)}
          >
            <Ionicons name={pill.icon} size={13} color={C.subtext} />
            <Text style={styles.statPillNumber}>{pill.value}</Text>
            {activeStatTooltip === pill.key && (
              <View style={styles.statTooltip} pointerEvents="none">
                <Text style={styles.statTooltipText}>{pill.tooltip}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Button title="New Tickle" onPress={() => router.push('/create')} variant="secondary" style={styles.newTickleShadow} />

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

      {!loading && entries.length === 0 && !profile?.quick_start_dismissed && (
        <QuickStartCard onDismiss={handleDismissQuickStart} style={styles.quickStartTopGap} />
      )}

      {!loading && entries.length === 0 && (
        <Text style={styles.emptyText}>No tickles yet — write about what made you smile today.</Text>
      )}

      {/* Skip re-rendering the same entry twice -- pinned (highest
          like_count in the last 14 days) and entries[0] (the single most
          recent entry) frequently coincide, especially for newer/lower-
          activity accounts. */}
      {!loading && spotlightEntries.length > 0 && spotlightEntries[0].id !== pinned?.id && (
        <>
          <Text style={styles.sectionLabel}>Latest tickle</Text>
          <TouchableOpacity
            style={styles.entryCard}
            activeOpacity={0.8}
            onPress={() => goToEntryInFeed(spotlightEntries[0].id)}
          >
            {renderEntryBody(spotlightEntries[0])}
          </TouchableOpacity>
        </>
      )}

      {!loading && entries.length > 0 && !profile?.quick_start_dismissed && (
        <QuickStartCard onDismiss={handleDismissQuickStart} />
      )}
    </ScrollView>
    </WallpaperBackground>

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

  paceReminderBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.sparkleBg, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12,
  },
  paceReminderIcon: { marginRight: 10 },

  vibeCardsRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  vibeLabelsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  vibeLabel: {
    flex: 1, fontSize: 12, fontWeight: '600', color: C.subtext, textAlign: 'center',
  },

  statPillsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: C.card, borderWidth: 1.2,
    // Large enough to always exceed half the box's actual height --
    // RN clamps borderRadius to min(radius, height/2), so this reads as
    // a genuine pill regardless of exact content-driven height, without
    // having to hardcode that height ourselves.
    borderRadius: 999,
    paddingVertical: 6,
  },
  statPillNumber: { fontSize: 13, fontWeight: '700', color: C.text },
  statTooltip: {
    position: 'absolute', top: -34, left: -30, right: -30,
    alignItems: 'center',
  },
  statTooltipText: {
    fontSize: 11, fontWeight: '600', color: C.bg, textAlign: 'center',
    backgroundColor: C.rustDark, borderRadius: 8, overflow: 'hidden',
    paddingVertical: 4, paddingHorizontal: 10,
  },

  newTickleShadow: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },

  pinnedCard: {
    marginTop: 12, borderWidth: 1.5, borderColor: C.amberDark, backgroundColor: withAlpha(C.amberDark, 0.16),
  },
  pinnedLabel: {
    fontSize: 12, fontWeight: '600', color: C.sparkleText,
    marginBottom: 8,
  },

  sectionLabel: { fontSize: 14, fontWeight: '600', color: C.subtext, marginTop: 6, marginBottom: 6 },
  loader: { marginTop: 12 },
  quickStartTopGap: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 12 },

  entryCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 10, marginBottom: 12,
  },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  vibeIconSlot: { marginRight: 12, marginTop: 4 },
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
