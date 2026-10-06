import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor, NATURE_ORDER, NATURE_LABELS, VIBE_COLORS, vibeIconColor, withAlpha } from '../../lib/theme';
import {
  isThisWeek, isThisMonth, localDateString, toLocalDateString, parseLocalDateString,
  currentWeekStartISO, monthStartISO, DEFAULT_WEEK_START_DAY,
} from '../../lib/week';
import { fetchFoundingMemberPaceStatus, fetchFoundingMemberOptInReminderStatus } from '../../lib/foundingMember';
import { flagEmoji } from '../../lib/country';
import { initPinBoardDb, getPhotosForEntries } from '../../lib/pinBoardDb';
import { fetchTokenBalance, fetchWishlistItems } from '../../lib/tokens';
import { fetchFollowedTales } from '../../lib/tales';
import Button from '../../components/Button';
import VibeCard from '../../components/VibeCard';
import NatureIcon from '../../components/NatureIcon';
import InitialsAvatar from '../../components/InitialsAvatar';
import AboutModal from '../../components/AboutModal';
import FoundingMemberBadge from '../../components/FoundingMemberBadge';
import QuickStartCard from '../../components/QuickStartCard';
import CornerNav from '../../components/CornerNav';
import WallpaperBackground from '../../components/WallpaperBackground';
import TesterFeedbackPill from '../../components/TesterFeedbackPill';
import {
  requestReminderPermission,
  scheduleDailyReminder,
  cancelDailyReminder,
  regenerateAwarenessCueSchedule,
  cancelAwarenessCueSchedule,
} from '../../lib/reminders';
import { isReviewAvailable, requestReview } from '../../lib/rateUs';

// Caps Home's content on tablet/wide screens so it doesn't stretch
// edge-to-edge -- wallpaper (painted by WallpaperBackground, behind
// this content) still fills the full screen width either way.
const HOME_CONTENT_MAX_WIDTH = 600;

// Same idea as feed.js's/calendar.js's own resolveLinkedPhotoUris --
// resolves both photo_only entries and entry_kind='text' entries with a
// Tickle-a-Photo link: local file if this device has (and still has) the
// pin-board link, falling back to the entry's own media_url otherwise.
// Home's own entries are always this account's own (loadEntries always
// filters user_id=session.user.id), so that fallback mostly matters for
// the owner's own second device, same as calendar.js's own version of
// this function. Neither branch covers "the file's genuinely missing" --
// callers just get back no map entry for that id, which the "Remember
// this?" card's photo-only thumbnail below treats as "not available".
async function resolveLinkedPhotoUris(userId, entries) {
  if (!entries.length) return new Map();

  const localPhotos = await getPhotosForEntries(userId, entries.map((e) => e.id));
  const map = new Map();
  for (const entry of entries) {
    const local = localPhotos.get(entry.id);
    if (local && new File(local.file_path).exists) {
      map.set(entry.id, local.file_path);
    } else if (entry.media_url) {
      map.set(entry.id, entry.media_url);
    }
  }
  return map;
}

// Whole local calendar days between a stored 'YYYY-MM-DD' entry_date and
// today. Math.round absorbs the 23h/25h days a DST switch produces.
function daysAgo(entryDate) {
  const today = parseLocalDateString(localDateString(0));
  return Math.round((today - parseLocalDateString(entryDate)) / 86400000);
}

// Same calendar day N months back, or null when that day doesn't exist
// (e.g. one month before Mar 31, or one year before Feb 29) -- setMonth
// would silently roll over into a different day, which isn't really an
// anniversary.
function sameDayMonthsAgo(months) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return d.getDate() === now.getDate() ? toLocalDateString(d) : null;
}

// "Yesterday" / "5 days ago" / "3 weeks ago" / "4 months ago" / "2 years ago".
function relativeDayLabel(days) {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} ${w === 1 ? 'week' : 'weeks'} ago`;
  }
  const months = Math.round(days / 30.44);
  if (days < 365 && months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const y = Math.max(1, Math.floor(days / 365));
  return `${y} ${y === 1 ? 'year' : 'years'} ago`;
}

// "just now" / "5 minutes ago" / "3 hours ago" / "yesterday" / "4 days
// ago", from an ISO timestamp. Elapsed time, not calendar days -- unlike
// relativeDayLabel above, which works on a date-only entry_date.
function relativeTimeLabel(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// Small non-cryptographic string hash (djb2) -- only has to spread
// consecutive dates across the candidate list, not resist anything.
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

// "Remember this?" pick: one of the user's own past Tickles, stable for
// the whole local day, rotating the next. Pure function of the
// already-loaded entries -- no query, no storage, no profile write.
// Tiers are tried in order and the first non-empty one wins; within a
// tier, candidates are sorted by id and indexed by a hash of
// userId + today, so a refocus later the same day lands on the same
// entry. My Day (day_journal) is left out -- it's long-form personal
// writing that doesn't read well as a 4-line memory snippet.
// Returns { entry, isFallback } or null.
function pickRememberEntry(entries, userId) {
  const today = localDateString(0);
  const past = entries.filter((e) => e.entry_date < today && e.tickle_nature !== 'day_journal');

  const yearAgo = sameDayMonthsAgo(12);
  const monthAgo = sameDayMonthsAgo(1);
  const weekAgo = localDateString(7);
  const inBand = (lo, hi) => (e) => {
    const d = daysAgo(e.entry_date);
    return d >= lo && d <= hi;
  };
  const tiers = [
    (e) => e.entry_date === yearAgo,
    (e) => e.entry_date === monthAgo,
    (e) => e.entry_date === weekAgo,
    inBand(360, 370),
    inBand(28, 32),
    inBand(6, 8),
    (e) => daysAgo(e.entry_date) >= 7,
  ];

  for (const matches of tiers) {
    const candidates = past.filter(matches).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (candidates.length) {
      return { entry: candidates[hashString(`${userId}${today}`) % candidates.length], isFallback: false };
    }
  }

  // Thin history: the latest Tickle instead (today's included), still
  // skipping My Day for the same reason as above.
  const latest = entries.find((e) => e.tickle_nature !== 'day_journal');
  return latest ? { entry: latest, isFallback: true } : null;
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

  // Reconciliation for Settings toggles that intentionally no longer call
  // setProfile()/refreshProfile() themselves (notify_on_likes,
  // daily_reminder, tokens_enabled, etc. — see project memory:
  // tickle-nature-toggle-bug) now lives in CornerNav.js's own
  // useFocusEffect, since that component is mounted on all four tab
  // screens rather than just this one — closes the previously-accepted
  // gap where reaching Settings from Feed/Calendar/Pinboard directly
  // (not via Home) left the shared profile stale until the next Home visit.

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  // Map<entryId, uri> -- resolved display image for every currently-
  // loaded entry that has one (photo_only, or a text entry with a
  // Tickle-a-Photo link), see resolveLinkedPhotoUris above.
  const [linkedPhotoUris, setLinkedPhotoUris] = useState(new Map());
  const [tokenBalance, setTokenBalance] = useState(0);
  const [rewardItems, setRewardItems] = useState([]);
  const [followedTales, setFollowedTales] = useState([]);
  const [followedTaleCount, setFollowedTaleCount] = useState(0);
  const [madeMeSmileTotals, setMadeMeSmileTotals] = useState({ week: 0, month: 0, allTime: 0 });
  const [thoughtOfYouTotals, setThoughtOfYouTotals] = useState({ week: 0, month: 0, allTime: 0 });
  const [showGuide, setShowGuide] = useState(false);
  const [showRatePrompt, setShowRatePrompt] = useState(false);
  const [showReturnedMessage, setShowReturnedMessage] = useState(false);
  const returnedMessageShownRef = useRef(false);
  const [activeStatTooltip, setActiveStatTooltip] = useState(null);
  const statTooltipTimerRef = useRef(null);
  const [activeVibeTooltip, setActiveVibeTooltip] = useState(null);
  const vibeTooltipTimerRef = useRef(null);
  // Multickle id -> created_at of the newest unread Tic notification its
  // "Multickles you follow" pill was showing when tapped this session --
  // see loadFollowedTales.
  const tappedTaleNewAtRef = useRef(new Map());
  // Lets the tester pill scroll its note box clear of the keyboard.
  const scrollRef = useRef(null);
  const [paceReminder, setPaceReminder] = useState(null);
  const [optInReminder, setOptInReminder] = useState(null);

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

  // Regenerates the Awareness Cue batch only once the current one has
  // genuinely expired, gated by awareness_cue_batch_valid_until -- the
  // multi-day batch redesign, 2026-08-22 (see supabase/migrations/0046).
  // Opening the app while the batch is still valid (its last covered
  // day hasn't passed) does nothing at all; this is the key behavior
  // change from the old daily-regeneration model, where every open
  // re-checked against a single day's marker. A mid-batch settings
  // change still forces an immediate regeneration regardless, via
  // migration 0045's invalidation (app/settings.js) nulling this same
  // column -- unaffected by this redesign, reused as-is. Deliberately
  // the only place that ever calls regenerateAwarenessCueSchedule/
  // cancelAwarenessCueSchedule -- unlike the daily reminder, Settings'
  // own Awareness Cue handlers only write preference columns, never
  // call the scheduler directly, to avoid the known duplicate-native-
  // call race documented on the daily-reminder effect above (banked
  // backlog #29). Accepted limitation (per spec): a day the user never
  // opens the app gets no cues that day -- unaffected by batching,
  // since today specifically is still clamped to "now" inside
  // regenerateAwarenessCueSchedule.
  // Switched from a plain useEffect to useFocusEffect (2026-08-27) as part
  // of converting Settings' Awareness Cue handlers to local-state-only --
  // see project memory: tickle-nature-toggle-bug. Real behavioral change:
  // regeneration now only runs when Home is genuinely focused, not on any
  // background re-render. type/frequency/count/window changes have a real
  // server-side backstop (claim_due_awareness_cue_users reads live DB
  // state independent of client staleness); turning awareness_cue_enabled
  // off does not -- already-scheduled local notifications from the prior
  // enabled state won't be cancelled client-side until the user's next
  // Home visit, bounded by the batch's own finite window. Accepted,
  // consistent with this feature's existing risk tolerance elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      const today = localDateString(0);

      if (!profile.awareness_cue_enabled) {
        if (profile.awareness_cue_batch_valid_until) {
          (async () => {
            try {
              await cancelAwarenessCueSchedule();
              await supabase
                .from('profiles')
                .update({ awareness_cue_batch_valid_until: null, awareness_cue_batch_source: null })
                .eq('id', profile.id);
              refreshProfile();
            } catch {
              // best-effort reconciliation only
            }
          })();
        }
        return;
      }

      if (profile.awareness_cue_batch_valid_until && profile.awareness_cue_batch_valid_until >= today) return;

      (async () => {
        try {
          const granted = await requestReminderPermission();
          if (!granted) return;
          const batchValidUntil = await regenerateAwarenessCueSchedule({
            type: profile.awareness_cue_type,
            frequencyMode: profile.awareness_cue_frequency_mode,
            count: profile.awareness_cue_count,
            windowStartMinute: profile.awareness_cue_window_start_minute,
            windowEndMinute: profile.awareness_cue_window_end_minute,
            soundConfirmed: profile.awareness_cue_sound_confirmed,
          });
          if (batchValidUntil) {
            await supabase
              .from('profiles')
              .update({ awareness_cue_batch_valid_until: batchValidUntil, awareness_cue_batch_source: 'client' })
              .eq('id', profile.id);
            refreshProfile();
          }
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
      profile?.awareness_cue_sound_confirmed,
      profile?.awareness_cue_batch_valid_until,
    ])
  );

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
      .select('id, entry_date, text_content, like_count, goal_id, tickle_nature, visibility, is_edited, created_at, user_id, entry_kind, local_photo_filename, media_url')
      .eq('user_id', session.user.id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error) {
      setEntries(data || []);
      // initPinBoardDb first -- Home can be the very first screen a
      // fresh install ever visits, same reasoning as feed.js's
      // loadPhotoLinks, so it can't assume another tab already created
      // the local SQLite tables.
      await initPinBoardDb(session.user.id);
      setLinkedPhotoUris(await resolveLinkedPhotoUris(session.user.id, data || []));
    }
    setLoading(false);
  }, [session]);

  const loadGoals = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setGoals(data || []);
  }, [session]);

  // Week/month/all-time totals for Home's two caption-split stat pills --
  // polaroid_share_events (migration 0064), the real per-caption log of
  // Tickle Pics' captioned polaroid shares. Replaces the earlier
  // tickle_shares-based approach, which counted ANY captioned share (text
  // entries, Photo-Only Tickles hardcoded to one caption regardless of
  // content) rather than this specific action.
  //
  // Same week/month boundary helpers Weekly Summary already uses for
  // identical cloud timestamptz filtering (lib/week.js) -- no new date
  // logic invented here.
  const loadCaptionShareTotals = useCallback(async () => {
    if (!session) return;
    const weekStartISO = currentWeekStartISO(profile?.week_start_day ?? DEFAULT_WEEK_START_DAY);
    const monthStartISOValue = monthStartISO();

    const countSince = (caption, sinceISO) =>
      supabase.from('polaroid_share_events').select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id).eq('caption', caption).gte('created_at', sinceISO);
    const countAllTime = (caption) =>
      supabase.from('polaroid_share_events').select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id).eq('caption', caption);

    const [smileWeek, smileMonth, smileAll, thoughtWeek, thoughtMonth, thoughtAll] = await Promise.all([
      countSince('made_me_smile', weekStartISO),
      countSince('made_me_smile', monthStartISOValue),
      countAllTime('made_me_smile'),
      countSince('thought_of_you', weekStartISO),
      countSince('thought_of_you', monthStartISOValue),
      countAllTime('thought_of_you'),
    ]);

    setMadeMeSmileTotals({
      week: smileWeek.error ? 0 : (smileWeek.count || 0),
      month: smileMonth.error ? 0 : (smileMonth.count || 0),
      allTime: smileAll.error ? 0 : (smileAll.count || 0),
    });
    setThoughtOfYouTotals({
      week: thoughtWeek.error ? 0 : (thoughtWeek.count || 0),
      month: thoughtMonth.error ? 0 : (thoughtMonth.count || 0),
      allTime: thoughtAll.error ? 0 : (thoughtAll.count || 0),
    });
  }, [session, profile]);

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
      loadCaptionShareTotals();
    }, [loadCaptionShareTotals])
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

  // Sibling to loadPaceReminder above, same read-only reasoning --
  // deliberately NOT gated on founding_member_taking_part/founding_
  // member_reminders_enabled, unlike loadPaceReminder: those are
  // quest-in-progress toggles that don't exist/apply yet during the
  // pending_opt_in cooldown (see app/founding-member.js's own
  // pending_opt_in branch, which renders before either toggle).
  const loadOptInReminder = useCallback(async () => {
    if (!session) return;
    try {
      setOptInReminder(await fetchFoundingMemberOptInReminderStatus(session.user.id));
    } catch {
      // Best-effort -- a failed fetch shouldn't block Home.
      setOptInReminder(null);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadOptInReminder();
    }, [loadOptInReminder])
  );

  // Balance + Reward List for the "You can redeem" strip. Deliberately its
  // own two fetches rather than shared with CornerNav's header circle
  // (which only fetches the cheapest cost, and keeps its state private to
  // each tab's instance) -- +2 queries per Home focus, accepted for now;
  // see home_bottom_redesign_audit.md section 3 for the zero-cost option.
  // Skipped, and cleared, while Tokens & Rewards is off -- same
  // "!== false" idiom as CornerNav's showTokens, and the same one-refresh
  // lag right after the Settings switch flips.
  const tokensEnabled = profile?.tokens_enabled !== false;
  const loadRewards = useCallback(async () => {
    if (!session || !tokensEnabled) {
      setTokenBalance(0);
      setRewardItems([]);
      return;
    }
    try {
      const [balance, items] = await Promise.all([fetchTokenBalance(), fetchWishlistItems()]);
      setTokenBalance(balance);
      setRewardItems(items || []);
    } catch {
      // Best-effort -- a failed fetch just hides the strip.
      setRewardItems([]);
    }
  }, [session, tokensEnabled]);

  useFocusEffect(
    useCallback(() => {
      loadRewards();
    }, [loadRewards])
  );

  // "Multickles you follow": one pill per followed Multickle that's still
  // Ongoing (not completed_at, the same field tale.js's Ongoing/Complete
  // pill uses), with NEW on any that has an unread tale_chapter
  // notification. Its own two fetches in parallel (see
  // home_multickles_card_audit.md): the unread Tic notifications, and
  // fetchFollowedTales -- which also drops Multickles since unfollowed
  // (their notifications stay unread, users can't delete them) and gives
  // the footer's (N), matching the Stash Following pills. Order: NEW
  // first, newest unread first; then the rest in fetchFollowedTales'
  // newest-follow-first order -- tales has no last-Tic/updated_at column,
  // so there's no cheaper activity date to sort by. Read-only: tale.js
  // marks the notifications read when the Multickle is opened, never
  // Home. Best-effort -- any failure just clears the state and hides it.
  const loadFollowedTales = useCallback(async () => {
    if (!session) {
      setFollowedTales([]);
      setFollowedTaleCount(0);
      return;
    }
    try {
      const [notifRes, followed] = await Promise.all([
        supabase
          .from('notifications')
          .select('tale_id, created_at')
          .eq('recipient_id', session.user.id)
          .eq('type', 'tale_chapter')
          .eq('is_read', false)
          .order('created_at', { ascending: false }),
        fetchFollowedTales(session.user.id),
      ]);
      if (notifRes.error) throw notifRes.error;
      // Already newest first, so the first row per Multickle is its newest.
      const newestUnread = new Map();
      for (const n of notifRes.data || []) {
        if (!newestUnread.has(n.tale_id)) newestUnread.set(n.tale_id, n.created_at);
      }
      const pills = followed
        .filter((t) => !t.completed)
        .map((t) => {
          let newAt = newestUnread.get(t.id) || null;
          // Tapped this session and nothing newer since -- tale.js's
          // mark-read may not have landed yet when the user comes straight
          // back, so don't flash NEW back in. A newer Tic still shows it.
          const tappedAt = tappedTaleNewAtRef.current.get(t.id);
          if (newAt && tappedAt && new Date(newAt) <= new Date(tappedAt)) newAt = null;
          return { id: t.id, title: t.title, newAt };
        });
      const withNews = pills.filter((t) => t.newAt).sort((a, b) => new Date(b.newAt) - new Date(a.newAt));
      setFollowedTales([...withNews, ...pills.filter((t) => !t.newAt)]);
      setFollowedTaleCount(followed.length);
    } catch {
      setFollowedTales([]);
      setFollowedTaleCount(0);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadFollowedTales();
    }, [loadFollowedTales])
  );

  // Achieved goals are left out of Home's "Your Goals" card -- they keep
  // their row (and their color on already-tagged entries) but are no
  // longer something being worked on.
  const activeGoals = goals.filter((g) => !g.achieved_at);

  // Same scroll-to-and-highlight mechanism notifications.js already
  // uses to jump into Tickle Stash's Mine tab at a specific entry.
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
  const rippleWeekStartDay = profile?.week_start_day ?? DEFAULT_WEEK_START_DAY;
  const totalRipples = entries.filter((e) => e.visibility === 'public').length;
  const weekRipples = entries.filter((e) => e.visibility === 'public' && isThisWeek(e.entry_date, rippleWeekStartDay)).length;
  const monthRipples = entries.filter((e) => e.visibility === 'public' && isThisMonth(e.entry_date)).length;

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

  // Weekly counterpart -- same shape as isVibeLit, compares the
  // already-computed WEEK count (vibeWeekCounts, already
  // week-start-day-aware) against weekly_goal_<nature> instead of
  // today's count against daily_goal_<nature>. A distinct, new mechanic
  // from the still-unbuilt "weekly goal-line" chart concept in
  // DayTickles_Home_Vibes_Redesign_Spec_v1.md -- see migration 0053.
  function isVibeLitWeekly(key) {
    const target = profile?.[`weekly_goal_${key}`];
    if (!target) return false;
    return vibeWeekCounts[key] >= target;
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

  // Same [midpoint, end) + dismissed_at-vs-window-start pattern as the
  // pace reminder above, and deliberately the SAME dismissed_at column
  // (not a second one) -- the cooldown window's start (signup/first-
  // contact time) is always earlier than month 1's eventual window
  // start (opt-in time), so a cooldown dismissal naturally stops
  // applying the moment real quest tracking begins, with no extra
  // bookkeeping needed. See migration 0049 / fetchFoundingMemberOptInReminderStatus.
  let showOptInReminder = false;
  if (optInReminder) {
    const startMs = new Date(optInReminder.window.startISO).getTime();
    const endMs = new Date(optInReminder.window.endISOExclusive).getTime();
    const midMs = (startMs + endMs) / 2;
    const nowMs = Date.now();
    const dismissedMs = profile?.founding_member_reminder_dismissed_at
      ? new Date(profile.founding_member_reminder_dismissed_at).getTime()
      : 0;
    showOptInReminder = nowMs >= midMs && nowMs < endMs && dismissedMs < startMs;
  }

  async function handleDismissOptInReminder() {
    setOptInReminder(null);
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

  // Both bottom cards below are pure derivations of the already-loaded
  // entries/goals -- no query of their own (see
  // home_bottom_redesign_audit.md). Goal counts are disjoint: goal_id is
  // a single column, so an entry counts toward at most one Goal.
  const remember = session ? pickRememberEntry(entries, session.user.id) : null;
  const goalCounts = new Map();
  for (const e of entries) {
    if (e.goal_id) goalCounts.set(e.goal_id, (goalCounts.get(e.goal_id) || 0) + 1);
  }

  // Compact and read-only on purpose -- no goal dot/Share/Edit/Ripple/
  // Delete row like the old spotlight cards had; tapping anywhere on the
  // card jumps to the entry in Tickle Stash, where all of those actions
  // live. "Open" is just the visible cue, plain text rather than a second
  // touchable nested inside the card's own. Photo-only
  // entries get a small thumbnail instead of the full Polaroid, which
  // at Home's width was close to a screen tall on its own.
  function renderRememberCard() {
    const { entry, isFallback } = remember;
    const isPhotoOnly = entry.entry_kind === 'photo_only';
    const photoUri = isPhotoOnly ? linkedPhotoUris.get(entry.id) || null : null;
    const natureLabel = NATURE_LABELS[entry.tickle_nature];
    return (
      <TouchableOpacity
        style={styles.entryCard}
        activeOpacity={0.8}
        onPress={() => goToEntryInFeed(entry.id)}
      >
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardLabel}>{isFallback ? 'Your latest Tickle' : 'Remember this?'}</Text>
          <Text style={styles.relativeTime}>{relativeDayLabel(daysAgo(entry.entry_date))}</Text>
        </View>
        {!isPhotoOnly && !!entry.text_content && (
          <Text style={styles.entryText} numberOfLines={4}>{entry.text_content}</Text>
        )}
        <View style={styles.rememberFooter}>
          {isPhotoOnly && (
            photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.rememberThumb} />
            ) : (
              <View style={[styles.rememberThumb, styles.rememberThumbMissing]}>
                <Ionicons name="image-outline" size={22} color={C.faint} />
              </View>
            )
          )}
          {!!natureLabel && (
            <View style={styles.natureChip}>
              {!!VIBE_COLORS[entry.tickle_nature] && (
                <NatureIcon nature={entry.tickle_nature} size={14} color={vibeIconColor(entry.tickle_nature)} />
              )}
              <Text style={styles.natureChipText}>{natureLabel}</Text>
            </View>
          )}
          <Text style={[styles.openLink, styles.openAction]}>Open</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // "You can redeem" strip: only ever lists rewards affordable right now
  // -- never the ones still out of reach, and no "almost there" hint, so
  // it can only ever read as good news. Rewards are repeatable (redeeming
  // never removes one, see migration 0065), so a chip simply stays while
  // it's still affordable. rewardItems is already sorted by cost
  // ascending (fetchWishlistItems). Redeeming itself stays on the Reward
  // List with its own confirmation -- the header row and every chip just
  // open it, same target as CornerNav's header circle.
  const affordableRewards = tokensEnabled ? rewardItems.filter((i) => i.cost <= tokenBalance) : [];

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  // Same transparent pill-row pattern as Your Goals and Multickles you
  // follow: no white card, and the header row and each pill are their
  // own touchables rather than one around the whole section, so a
  // sideways swipe on the pill row scrolls it without also firing a tap.
  // No pill cap: every affordable reward gets a pill, and the row runs
  // to the content edge so the last visible pill peeks as a scroll hint.
  // The label leads the header row so it lines up with the other two
  // section labels; the balance circle follows it.
  function renderRedeemCard() {
    const headerA11y =
      `${tokenBalance} token${tokenBalance === 1 ? '' : 's'}. ` +
      `You can redeem ${joinNames(affordableRewards.map((i) => i.label))}. Opens Reward List.`;
    return (
      <View style={styles.goalsSection}>
        <TouchableOpacity
          style={styles.redeemHeaderRow}
          activeOpacity={0.7}
          onPress={() => router.push('/wishlist')}
          accessibilityRole="button"
          accessibilityLabel={headerA11y}
        >
          <Text style={styles.cardLabel}>You can redeem</Text>
          <View style={styles.redeemBalanceCircle}>
            <Text style={styles.redeemBalanceText}>{tokenBalance}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.subtext} style={styles.redeemHeaderChevron} />
        </TouchableOpacity>
        {/* Keyed by the affordable ids so the row remounts at the first
            pill whenever that list changes (e.g. a redeem drops a pill),
            rather than keeping a stale scroll offset into a shorter row. */}
        <ScrollView
          key={affordableRewards.map((i) => i.id).join(',')}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.goalPillsRow}
        >
          {affordableRewards.map((item) => (
            // Name and cost in separate Texts so only the name truncates --
            // a long (up to 60-char) label would otherwise push the cost
            // off the end of a single truncated line.
            <TouchableOpacity
              key={item.id}
              style={[styles.goalPill, styles.redeemPill]}
              activeOpacity={0.7}
              onPress={() => router.push('/wishlist')}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}, ${item.cost} token${item.cost === 1 ? '' : 's'}. Opens Reward List.`}
            >
              <Text style={styles.redeemPillLabel} numberOfLines={1}>{item.label}</Text>
              <MaterialCommunityIcons name="circle-multiple-outline" size={16} color={C.subtext} />
              <Text style={styles.redeemPillCost}>{item.cost}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Tapping a pill opens the Multickle and clears its NEW locally, in
  // place -- no re-order or removal, so the row's key (and scroll
  // position) stays put; tale.js marks the notifications read. The
  // newest unread created_at it was showing is remembered, so a Home
  // focus that beats that mark-read doesn't bring NEW back, while a newer
  // Tic still does.
  function openFollowedTale(tale) {
    if (tale.newAt) {
      tappedTaleNewAtRef.current.set(tale.id, tale.newAt);
      setFollowedTales((prev) => prev.map((t) => (t.id === tale.id ? { ...t, newAt: null } : t)));
    }
    router.push({ pathname: '/tale', params: { id: tale.id } });
  }

  // Same pattern as the Your Goals section below: transparent, no white
  // card, a sideways row of pills (reusing the Goal pill's shape and
  // type), each its own touchable so a swipe on the row scrolls it
  // without opening a Multickle. Then the footer link, also its own
  // touchable.
  function renderFollowedTalesCard() {
    return (
      <View style={styles.goalsSection}>
        <Text style={[styles.cardLabel, styles.goalsCardLabel]}>Multickles you follow</Text>
        {/* Keyed by the ordered ids so the row restarts at the first pill
            when the list changes; a tap only clears NEW, so it keeps
            the key. */}
        <ScrollView
          key={followedTales.map((t) => t.id).join(',')}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.goalPillsRow}
        >
          {followedTales.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.goalPill, t.newAt ? styles.followedPillNew : styles.followedPillPlain]}
              activeOpacity={0.7}
              onPress={() => openFollowedTale(t)}
              accessibilityRole="button"
              accessibilityLabel={
                t.newAt
                  ? `${t.title}, new Tic added ${relativeTimeLabel(t.newAt)}. Opens Multickle.`
                  : `${t.title}. Opens Multickle.`
              }
            >
              {!!t.newAt && (
                <View style={styles.newPill}>
                  <Text style={styles.newPillText}>NEW</Text>
                </View>
              )}
              <Text style={styles.followedPillLabel} numberOfLines={1}>{t.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={styles.followedTalesLink}
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/feed', params: { tab: 'following' } })}
          accessibilityRole="button"
          accessibilityLabel={`All Multickles you follow, ${followedTaleCount}. Opens the Following tab.`}
        >
          <Text style={styles.openLink}>All Multickles you follow ({followedTaleCount})</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // One pill per active Goal -> that Goal's own summary screen
  // (app/goal.js), in a sideways-scrolling row -- same pattern as the
  // "You can redeem" strip below: each pill is its own touchable, with no
  // wrapper touchable around the card, so a swipe on the row scrolls it
  // without opening a Goal. No white card: like the Vibe cards and the
  // Mojo Shared pill rows above, it sits straight on the wallpaper as a
  // plain View with no fill/border/padding, so the pills run to the
  // content edge and the last one peeks there. With no active Goals, a
  // gentle prompt instead; the caller hides this section entirely until
  // the first entry exists, so a brand-new account isn't shown two calls
  // to action at once (QuickStartCard already covers that state).
  function renderGoalsCard() {
    return (
      <View style={styles.goalsSection}>
        <Text style={[styles.cardLabel, styles.goalsCardLabel]}>Your Goals</Text>
        {activeGoals.length === 0 ? (
          <>
            <Text style={styles.goalsPromptText}>
              Working towards something? Add a Goal, then tag Tickles to it as you go.
            </Text>
            <Button title="Add a Goal" onPress={() => router.push('/goals')} variant="secondary" />
          </>
        ) : (
          // Keyed by the active Goal ids so the row restarts at the first
          // pill whenever the Goals change, same as the redeem row.
          <ScrollView
            key={activeGoals.map((g) => g.id).join(',')}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.goalPillsRow}
          >
            {activeGoals.map((g) => {
              const count = goalCounts.get(g.id) || 0;
              // Hidden when the Tokens master switch is off, same
              // "!== false" idiom as CornerNav's showTokens.
              const showCoin = g.earns_tokens && profile?.tokens_enabled !== false;
              return (
                // Unselected look of New Tickle's Vibe pills (create.js's
                // natureOption): 14% tint fill + full-colour 1px border. The
                // Goal colour lives in the tint and border, so the separate
                // dot is gone.
                <TouchableOpacity
                  key={g.id}
                  style={[styles.goalPill, { backgroundColor: withAlpha(g.color, 0.14), borderColor: g.color }]}
                  activeOpacity={0.7}
                  onPress={() => router.push({ pathname: '/goal', params: { id: g.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `${g.label}, ${count} Tickle${count === 1 ? '' : 's'}` +
                    `${showCoin ? ', earns tokens' : ''}. Opens Goal summary.`
                  }
                >
                  <Text style={styles.goalPillLabel} numberOfLines={1}>{g.label}</Text>
                  {showCoin && (
                    <MaterialCommunityIcons name="circle-multiple-outline" size={16} color={C.subtext} />
                  )}
                  <Text style={styles.goalPillCount}>{count}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  const STAT_PILLS = [
    { key: 'madeMeSmile', icon: 'happy-outline', value: `${madeMeSmileTotals.week} | ${madeMeSmileTotals.month} | ${madeMeSmileTotals.allTime}`, tooltip: "This made me smile today · week / month / all-time", label: 'Polaroid' },
    { key: 'thoughtOfYou', icon: 'heart-outline', value: `${thoughtOfYouTotals.week} | ${thoughtOfYouTotals.month} | ${thoughtOfYouTotals.allTime}`, tooltip: "I saw this and thought of you · week / month / all-time", label: 'Polaroid' },
    { key: 'ripples', icon: 'eye-outline', value: `${weekRipples} | ${monthRipples} | ${totalRipples}`, tooltip: "Ripples · week / month / all-time", label: 'Ripples' },
  ];

  return (
    <>
    <WallpaperBackground>
    <ScrollView
      style={styles.container}
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: styles.content.paddingBottom + tabBarHeight },
      ]}
    >
      <View style={styles.contentInner}>
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
              Halfway through the month — a little nudge to check in on your Moji Quest progress. {paceReminderText}
            </Text>
            <TouchableOpacity
              onPress={handleDismissPaceReminder}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={16} color={C.sparkleText} />
            </TouchableOpacity>
          </View>
        )}

        {/* Tapping the text navigates to the FM page to actually opt in --
            this banner itself never opts anyone in on a stray tap, per
            the "visiting the page doesn't count as opting in" rule; the
            real action lives behind founding-member.js's own button. */}
        {showOptInReminder && (
          <View style={styles.paceReminderBanner}>
            <MaterialCommunityIcons name="crown-outline" size={18} color={C.sparkleText} style={styles.paceReminderIcon} />
            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/founding-member')}>
              <Text style={styles.ratePromptText}>
                Moji Quest invite — opt in before it closes to start your 6-month quest.
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDismissOptInReminder}
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
              litWeekly={isVibeLitWeekly(key)}
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
              <Text style={styles.statPillNumber}>{pill.value}</Text>
              {activeStatTooltip === pill.key && (
                <View style={styles.statTooltip} pointerEvents="none">
                  <Text style={styles.statTooltipText}>{pill.tooltip}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.statPillLabelsRow}>
          {STAT_PILLS.map((pill) => (
            <View key={pill.key} style={styles.statPillLabelItem}>
              <Ionicons name={pill.icon} size={11} color={C.subtext} />
              <Text style={styles.statPillLabel} numberOfLines={1}>{pill.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.statPillsCaption}>Mojo Shared</Text>

        <Button title="New Tickle" onPress={() => router.push('/create')} variant="secondary" style={styles.newTickleShadow} />
        <TesterFeedbackPill scrollRef={scrollRef} />

        {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

        {!loading && entries.length === 0 && !profile?.quick_start_dismissed && (
          <QuickStartCard onDismiss={handleDismissQuickStart} style={styles.quickStartTopGap} />
        )}

        {!loading && entries.length === 0 && (
          <Text style={styles.emptyText}>No tickles yet — write about what made you smile today.</Text>
        )}

        {!loading && entries.length > 0 && (
          <View style={styles.bottomCards}>
            {!!remember && renderRememberCard()}
            {renderGoalsCard()}
            {affordableRewards.length > 0 && renderRedeemCard()}
            {followedTales.length > 0 && renderFollowedTalesCard()}
          </View>
        )}

        {!loading && entries.length > 0 && !profile?.quick_start_dismissed && (
          <QuickStartCard onDismiss={handleDismissQuickStart} />
        )}
      </View>
    </ScrollView>
    </WallpaperBackground>

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
  content: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  contentInner: { width: '100%', maxWidth: HOME_CONTENT_MAX_WIDTH },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  // Cancels CornerNav's own marginBottom (meant for when it stands alone
  // at the top of Tickle Stash/Calendar/Tickle Pics) now that it's nested inside
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

  statPillsRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  statPillLabelsRow: { flexDirection: 'row', gap: 10, marginBottom: 2 },
  statPillLabelItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  statPillLabel: {
    fontSize: 11, fontWeight: '600', color: C.subtext, textAlign: 'center',
  },
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
  statPillsCaption: {
    fontSize: 11, fontWeight: '600', color: C.subtext, textAlign: 'center', marginBottom: 14,
  },
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

  loader: { marginTop: 12 },
  quickStartTopGap: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 12 },

  bottomCards: { marginTop: 12 },
  entryCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 12, marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  cardLabel: { fontSize: 13, fontWeight: '700', color: C.rustDark },
  relativeTime: { fontSize: 12, color: C.subtext },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },

  rememberFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  rememberThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: C.border },
  rememberThumbMissing: { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  natureChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
  },
  natureChipText: { fontSize: 11, fontWeight: '600', color: C.subtext },
  openAction: { marginLeft: 'auto' },
  openLink: { fontSize: 13, fontWeight: '700', color: C.rust },

  // Transparent section -- same treatment as vibeCardsRow/statPillsRow:
  // no background, border, shadow or padding, only the bottom margin
  // that entryCard uses, so the gap to the next card is unchanged.
  goalsSection: { marginBottom: 12 },
  goalsCardLabel: { marginBottom: 6 },
  goalsPromptText: { fontSize: 14, color: C.subtext, lineHeight: 20, marginBottom: 10 },
  goalPillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Shape, border, gap, paddingVertical and label type copied from
  // create.js's natureOption/natureOptionLabel (New Tickle's Vibe pills),
  // which keep these values local rather than in a shared style; the
  // per-Goal fill/border colour is applied inline. minHeight 44 (above
  // natureOption's ~37 natural height) for a comfortable touch target;
  // maxWidth caps a long (up to 60-char) Goal name so only it truncates.
  goalPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 44, maxWidth: 240, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1,
  },
  goalPillLabel: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: C.subtext },
  // Count stays a step bolder and darker than the label so the number
  // still reads first at New Tickle's smaller 12px size.
  goalPillCount: { flexShrink: 0, fontSize: 12, fontWeight: '700', color: C.text },

  // "You can redeem" sits in goalsSection like the other two pill rows.
  // Its header is a 44px touch target with the label first, so the label
  // keeps the same left edge as "Your Goals" and "Multickles you follow".
  // The negative margins pull that taller row back so the label keeps the
  // same ~12dp gap above and 6dp gap below as the other section labels;
  // -12 stops the tap area exactly at the previous section's pills, and
  // the pill row (rendered after it) wins the 7dp it overlaps below.
  redeemHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44,
    marginTop: -12, marginBottom: -7,
  },
  redeemHeaderChevron: { marginLeft: 'auto' },
  // Same look as CornerNav's tokenCircle + tokenCircleFilled.
  redeemBalanceCircle: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.subtext, backgroundColor: C.subtext,
  },
  redeemBalanceText: { fontSize: 11, fontWeight: '700', color: C.card },
  // Reward pills reuse goalPill's shape; a soft amber tint with the full
  // amber border so they read as good news. Name and cost use the Goal
  // pill's type (12/600 label, 12/700 count), with the same coin icon.
  redeemPill: { backgroundColor: withAlpha(C.amberBg, 0.25), borderColor: C.amberDark },
  redeemPillLabel: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: C.text },
  redeemPillCost: { flexShrink: 0, fontSize: 12, fontWeight: '700', color: C.text },

  // "Multickles you follow" pills reuse goalPill's shape; only the fill,
  // border and label colour differ. A pill with a new Tic takes the
  // amber of the NEW tag so it stands out; the rest stay neutral.
  followedPillPlain: { backgroundColor: C.card, borderColor: C.border },
  followedPillNew: { backgroundColor: C.amberBg, borderColor: C.amberDark },
  followedPillLabel: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: C.text },
  // Shape and type of tale.js's Ongoing pill (statusPill + statusPillText),
  // as a dark chip with white text so it stands out on the amber pill
  // around it. Never shrinks, so a long title truncates rather than
  // squeezing NEW.
  newPill: {
    flexShrink: 0, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1,
    backgroundColor: C.text, borderColor: C.text,
  },
  newPillText: { fontSize: 11, fontWeight: '700', color: C.card },
  followedTalesLink: { minHeight: 44, justifyContent: 'center' },
});
