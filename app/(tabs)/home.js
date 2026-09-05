import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor, SAVED_ENTRY_DOT_SIZE, withAlpha, NATURE_ORDER, NATURE_LABELS, VIBE_COLORS, vibeIconColor } from '../../lib/theme';
import { shareEntry, shareStatus, sharePhotoOnlyEntry, SHARE_CAPTIONS } from '../../lib/sharing';
import { isThisWeek, isThisMonth, localDateString, DEFAULT_WEEK_START_DAY } from '../../lib/week';
import { fetchFoundingMemberPaceStatus, fetchFoundingMemberOptInReminderStatus } from '../../lib/foundingMember';
import { flagEmoji } from '../../lib/country';
import { initPinBoardDb, getPhotosForEntries } from '../../lib/pinBoardDb';
import { useShareCard } from '../../lib/useShareCard';
import { makePhotoTicklePublic, makePhotoTicklePrivate, deletePhotoTickleMedia } from '../../lib/photoTickleStorage';
import Button from '../../components/Button';
import VibeCard from '../../components/VibeCard';
import NatureIcon from '../../components/NatureIcon';
import InitialsAvatar from '../../components/InitialsAvatar';
import AboutModal from '../../components/AboutModal';
import FoundingMemberBadge from '../../components/FoundingMemberBadge';
import GoalTagModal from '../../components/GoalTagModal';
import QuickStartCard from '../../components/QuickStartCard';
import DayDotsCard from '../../components/DayDotsCard';
import ShareModal from '../../components/ShareModal';
import CornerNav from '../../components/CornerNav';
import WallpaperBackground from '../../components/WallpaperBackground';
import {
  requestReminderPermission,
  scheduleDailyReminder,
  cancelDailyReminder,
  regenerateAwarenessCueSchedule,
  cancelAwarenessCueSchedule,
  currentDayDotsPromptDate,
} from '../../lib/reminders';
import { isReviewAvailable, requestReview } from '../../lib/rateUs';

const PINNED_WINDOW_DAYS = 14;

// Caps Home's content on tablet/wide screens so it doesn't stretch
// edge-to-edge -- wallpaper (painted by WallpaperBackground, behind
// this content) still fills the full screen width either way.
const HOME_CONTENT_MAX_WIDTH = 600;

// Deterministic per-entry tilt for the photo-only Polaroid render below --
// same idea as EntryCard.js's own rotationForId.
function rotationForId(id) {
  const str = String(id);
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return `${((sum % 5) - 2) * 1.5}deg`;
}

// Same idea as feed.js's/calendar.js's own resolvePhotoOnlyUris --
// local file if this device has (and still has) the pin-board link,
// falling back to the entry's own media_url otherwise (a no-op today
// since upload-on-public isn't built yet, see project memory). Neither
// existing covers "the file's genuinely missing" -- callers just get
// back no map entry for that id, which the photo-only render below
// treats as "not available".
async function resolvePhotoOnlyUris(userId, entries) {
  const photoOnlyEntries = entries.filter((e) => e.entry_kind === 'photo_only');
  if (!photoOnlyEntries.length) return new Map();

  const localPhotos = await getPhotosForEntries(userId, photoOnlyEntries.map((e) => e.id));
  const map = new Map();
  for (const entry of photoOnlyEntries) {
    const local = localPhotos.get(entry.id);
    if (local && new File(local.file_path).exists) {
      map.set(entry.id, local.file_path);
    } else if (entry.media_url) {
      map.set(entry.id, entry.media_url);
    }
  }
  return map;
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

  // Reconciliation point for Settings toggles that intentionally no longer
  // call setProfile()/refreshProfile() themselves (notify_on_likes,
  // daily_reminder — see project memory: tickle-nature-toggle-bug), so the
  // shared profile object still catches up whenever Home is focused.
  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  // Day Dots eligibility check -- bundled into daily_reminder, no
  // separate toggle (see lib/reminders.js's currentDayDotsPromptDate
  // header comment for why this is a single-date check, not a scan
  // over every previously-missed date). Re-runs on every focus, not
  // just mount, since the eligible date can change between focuses
  // (e.g. backgrounding across the 8pm cutoff or across midnight).
  useFocusEffect(
    useCallback(() => {
      if (!session || !profile?.daily_reminder) {
        setDayDotsPromptDate(null);
        return;
      }
      const promptDate = currentDayDotsPromptDate();
      let cancelled = false;
      supabase
        .from('day_dots')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('prompt_date', promptDate)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setDayDotsPromptDate(data ? null : promptDate);
        });
      return () => {
        cancelled = true;
      };
    }, [session, profile?.daily_reminder])
  );

  async function handleDayDotsSelect(dotIndex) {
    const promptDate = dayDotsPromptDate;
    setDayDotsPromptDate(null);
    await supabase
      .from('day_dots')
      .insert({ user_id: session.user.id, prompt_date: promptDate, status: 'answered', dot_index: dotIndex });
  }

  async function handleDayDotsSkip() {
    const promptDate = dayDotsPromptDate;
    setDayDotsPromptDate(null);
    await supabase
      .from('day_dots')
      .insert({ user_id: session.user.id, prompt_date: promptDate, status: 'skipped' });
  }

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [pickerEntryId, setPickerEntryId] = useState(null);
  const [shareEntryId, setShareEntryId] = useState(null);
  // Map<entryId, uri> -- resolved display image for every currently-
  // loaded photo-only entry, see resolvePhotoOnlyUris above. Also reused
  // as the share source in handlePhotoOnlyShare below, rather than
  // re-resolving per share.
  const [photoOnlyUris, setPhotoOnlyUris] = useState(new Map());
  const { hiddenCard, captureCard } = useShareCard();
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
  const [optInReminder, setOptInReminder] = useState(null);
  // Local 'YYYY-MM-DD' of the single currently-unanswered Day Dots
  // prompt, or null if there isn't one right now (reminder off, or
  // today/yesterday's date already has a row) -- see the focus effect
  // below and lib/reminders.js's currentDayDotsPromptDate.
  const [dayDotsPromptDate, setDayDotsPromptDate] = useState(null);

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
      setPhotoOnlyUris(await resolvePhotoOnlyUris(session.user.id, data || []));
    }
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

  // Thin wrapper around lib/sharing.js's sharePhotoOnlyEntry (shared with
  // feed.js/calendar.js's own Share buttons) -- this file's job is just
  // resolving this screen's own already-loaded photoOnlyUris into a uri
  // and turning the returned status into the right Alert; the actual
  // skip-ShareModal / bake-in-the-Vibe-label decision logic lives there
  // once, not duplicated per screen.
  async function handlePhotoOnlyShare(entry) {
    const result = await sharePhotoOnlyEntry({
      profile,
      entry,
      photoUri: photoOnlyUris.get(entry.id) || null,
      captureCard,
      accentColor: accent.card,
      onProfileUpdated: refreshProfile,
    });

    if (result.missingPhoto) {
      Alert.alert(
        "Can't share yet",
        "This photo isn't available on this device right now — open it in Tickle Stash to relink it, then try sharing again."
      );
    } else if (result.blocked) {
      Alert.alert(
        'Share limit reached',
        `You've used all ${result.cap} shares for this 30-day period. It renews automatically, or go unlimited with a paid plan.`
      );
    } else if (result.captureFailed) {
      Alert.alert("Couldn't share", 'Something went wrong preparing this photo to share — try again.');
    }
  }

  // Real DELETE, not a soft-hide — RLS already scopes it to entries you
  // own, and every table referencing tickle_entries (likes, favorites,
  // notifications, shares, etc.) cascades on delete (confirmed against
  // the schema before building this). Home and Tickle Stash each reload their
  // own entries on focus already, so a deletion made on one screen is
  // picked up by the other the next time it's revisited — no separate
  // cross-screen refresh mechanism needed.
  function confirmDeleteEntry(entry) {
    Alert.alert(
      'Delete this tickle?',
      "This can't be undone — it removes the entry everywhere, including any likes or shares.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteEntry(entry) },
      ]
    );
  }

  async function handleDeleteEntry(entry) {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));

    // Best-effort, never blocks the actual delete below -- see
    // deletePhotoTickleMedia's own comment.
    await deletePhotoTickleMedia(entry);

    const { error } = await supabase.from('tickle_entries').delete().eq('id', entry.id);
    if (error) setEntries(previous);
  }

  // Reversible, unlike delete, so no confirmation dialog — same
  // no-confirm treatment as follow/favorite/like. Going private just
  // means Everyone/Following's own visibility-filtered queries stop
  // matching this row next time they reload; Home and Mine never filter
  // on visibility, so they keep showing it either way.
  async function handleToggleVisibility(entry) {
    const newVisibility = entry.visibility === 'public' ? 'private' : 'public';

    // Photo-only entries going private -> public need the actual image
    // uploaded first (see lib/photoTickleStorage.js) -- not the plain
    // single-field flip below. Not optimistic like the plain path: this
    // is a real multi-step async operation (upload, then a combined DB
    // write) with real failure modes, so nothing changes on screen until
    // it's actually succeeded, rather than flashing "public" and then
    // reverting it a moment later.
    if (entry.entry_kind === 'photo_only' && newVisibility === 'public') {
      const photoUri = photoOnlyUris.get(entry.id) || null;
      if (!photoUri) {
        Alert.alert(
          "Can't make this public yet",
          "This photo isn't available on this device right now — open it in Tickle Stash to relink it, then try again."
        );
        return;
      }
      try {
        const mediaUrl = await makePhotoTicklePublic(entry, photoUri);
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, visibility: 'public', media_url: mediaUrl } : e))
        );
      } catch (err) {
        console.error('handleToggleVisibility: photo upload failed', err);
        // Real underlying message included, not just a generic line --
        // this is a genuinely new, unproven code path (Storage bucket +
        // RLS, no established pattern elsewhere in this app to lean on),
        // so a failure here should be self-diagnosing on-device rather
        // than requiring a Metro console dig every time.
        Alert.alert(
          "Couldn't make this public",
          `Something went wrong uploading this photo — try again.\n\n${err.message || String(err)}`
        );
      }
      return;
    }

    // Photo-only entries going public -> private genuinely remove the
    // Storage object too (see lib/photoTickleStorage.js's own comment)
    // -- the bucket is fully public-read, so leaving the object in
    // place would mean "private" only hides it from this app's own UI,
    // not a real access revocation. Same non-optimistic shape as the
    // going-public branch above, for the same reason: a real async
    // Storage operation with real failure modes, not an instant flip.
    if (entry.entry_kind === 'photo_only' && newVisibility === 'private') {
      try {
        await makePhotoTicklePrivate(entry);
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, visibility: 'private', media_url: null } : e))
        );
      } catch (err) {
        console.error('handleToggleVisibility: photo removal failed', err);
        Alert.alert(
          "Couldn't make this private",
          `Something went wrong removing this photo — try again.\n\n${err.message || String(err)}`
        );
      }
      return;
    }

    const previous = entries;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, visibility: newVisibility } : e)));

    const { error } = await supabase
      .from('tickle_entries')
      .update({ visibility: newVisibility })
      .eq('id', entry.id);

    if (error) setEntries(previous);
  }

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
    const isPhotoOnly = entry.entry_kind === 'photo_only';
    const photoUri = photoOnlyUris.get(entry.id) || null;
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
                color={vibeIconColor(entry.tickle_nature)}
              />
            )}
          </View>
          <View style={styles.entryBody}>
            {isPhotoOnly ? (
              // The Polaroid itself, same tilt+frame language as
              // EntryCard.js's own photo-only render -- sized larger
              // here since this is a single spotlight card, not one of
              // many in a scrolling list. Deliberately still sits inside
              // Home's normal bordered entryCard/pinnedCard treatment
              // (unlike EntryCard.js, which drops that surface for
              // photo-only entries) -- keeping it means the "Most smiled
              // with you" amber highlight stays visible even when that
              // pick happens to be a photo-only entry; revisit if this
              // reads wrong in practice.
              <View
                style={[styles.polaroidPhotoCard, { transform: [{ rotate: rotationForId(entry.id) }] }]}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.polaroidPhoto} />
                ) : (
                  <View style={styles.polaroidMissingWrap}>
                    <Ionicons name="image-outline" size={26} color={C.faint} />
                    <Text style={styles.polaroidMissingText}>
                      Photo not available here — open in Tickle Stash to relink
                    </Text>
                  </View>
                )}
                <View style={styles.polaroidCaptionStrip}>
                  <Text style={styles.polaroidCaptionLabel}>{NATURE_LABELS[entry.tickle_nature]}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.entryText} numberOfLines={1}>{entry.text_content}</Text>
            )}
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
            onPress={() => (isPhotoOnly ? handlePhotoOnlyShare(entry) : setShareEntryId(entry.id))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.shareAction}
          >
            <Text style={styles.shareLink}>Share</Text>
          </TouchableOpacity>
          {/* No text to edit on a photo-only entry -- same omission as
              EntryCard.js's own menu (re-picking the Vibe as a kind of
              "edit" was raised there but never resolved either way). */}
          {!isPhotoOnly && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/create', params: { entryId: entry.id } })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.editAction}
            >
              <Ionicons name="pencil-outline" size={16} color={C.subtext} />
            </TouchableOpacity>
          )}
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

        {/* Tapping the text navigates to the FM page to actually opt in --
            this banner itself never opts anyone in on a stray tap, per
            the "visiting the page doesn't count as opting in" rule; the
            real action lives behind founding-member.js's own button. */}
        {showOptInReminder && (
          <View style={styles.paceReminderBanner}>
            <MaterialCommunityIcons name="crown-outline" size={18} color={C.sparkleText} style={styles.paceReminderIcon} />
            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/founding-member')}>
              <Text style={styles.ratePromptText}>
                Founding Member invite — opt in before it closes to start your 6-month quest.
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

        {dayDotsPromptDate && (
          <DayDotsCard
            accentColor={accent.card}
            onSelectDot={handleDayDotsSelect}
            onSkip={handleDayDotsSkip}
          />
        )}

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
      </View>
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
    {hiddenCard}
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
  // Sized larger than EntryCard.js's own 75% -- this is a single
  // spotlight card, not one of many stacked in a scrolling feed, so
  // there's no crowding reason to keep it that small.
  polaroidPhotoCard: {
    width: '92%',
    alignSelf: 'center',
    backgroundColor: C.card,
    borderRadius: 8,
    padding: 8,
    paddingBottom: 6,
    marginTop: 4,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  polaroidPhoto: { width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: C.border },
  polaroidMissingWrap: {
    width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16,
  },
  polaroidMissingText: { fontSize: 12, color: C.subtext, textAlign: 'center' },
  polaroidCaptionStrip: { paddingTop: 8, paddingHorizontal: 2 },
  polaroidCaptionLabel: { fontSize: 13, fontWeight: '600', color: C.rustDark, textAlign: 'center' },
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
