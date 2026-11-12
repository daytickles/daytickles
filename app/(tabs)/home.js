import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, AccessibilityInfo, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor, NATURE_ORDER, NATURE_LABELS, VIBE_CARD_PALETTE, withAlpha } from '../../lib/theme';
import {
  isThisWeek, isThisMonth, localDateString, toLocalDateString, parseLocalDateString,
  currentWeekStartISO, monthStartISO, DEFAULT_WEEK_START_DAY,
} from '../../lib/week';
import { fetchFoundingMemberPaceStatus, fetchFoundingMemberOptInReminderStatus } from '../../lib/foundingMember';
import { flagEmoji } from '../../lib/country';
import { initPinBoardDb, getPhotosForEntries } from '../../lib/pinBoardDb';
import { fetchTokenBalance, fetchWishlistItems } from '../../lib/tokens';
import { fetchFollowedTales, fetchMyTales } from '../../lib/tales';
import { forgetQuickTickle, insertQuickTickle } from '../../lib/quickTickle';
import { showAlert, showSaveFailed } from '../../lib/themedAlert';
import Button from '../../components/Button';
import NewTickleButton, {
  TICKLE_BUTTON_SURFACE, TICKLE_BUTTON_INK, HOME_BUTTON_GAP, HOME_BUTTON_HIT_SLOP, QUICK_BUTTON_SHAPE, QUICK_DOT_SIZE,
} from '../../components/NewTickleButton';
import VibeCard from '../../components/VibeCard';
import NatureIcon from '../../components/NatureIcon';
import InitialsAvatar from '../../components/InitialsAvatar';
import AboutModal from '../../components/AboutModal';
import FoundingMemberBadge from '../../components/FoundingMemberBadge';
import QuickStartCard from '../../components/QuickStartCard';
import CornerNav from '../../components/CornerNav';
import WallpaperBackground from '../../components/WallpaperBackground';
import TesterFeedbackPill from '../../components/TesterFeedbackPill';
import GoalTargetCircle from '../../components/GoalTargetCircle';
import QuickTickleToast from '../../components/QuickTickleToast';
import QuickTicklePopover from '../../components/QuickTicklePopover';
import NailedItPopup from '../../components/NailedItPopup';
import FindBlogbitsPopup from '../../components/FindBlogbitsPopup';
import { listRecentGoalLogs } from '../../lib/goalLogs';
import RnrsPopup from '../../components/RnrsPopup';
import HomeDeck, {
  DECK_WIDTH, DECK_TEXT, DECK_SUBTEXT, deckRowStyles, HEADER_ADD_SIZE, HEADER_ADD_ICON_SIZE, HEADER_ADD_HIT_SLOP,
} from '../../components/HomeDeck';
import { useHomePalette } from '../../lib/homePalette';
import { homeCardsFor, homeCardsChosen } from '../../lib/homeCards';
import { PickCardsGhost, NoCardsBox } from '../../components/HomeCardsGhost';
import PickCardsSheet from '../../components/PickCardsSheet';
import { loadSentPolaroids } from '../../lib/polaroidsSent';
import { listTrackers, listRatings, ratingLabel } from '../../lib/trackers';
import HomePolaroidsGrid from '../../components/HomePolaroidsGrid';
import PolaroidViewModal from '../../components/PolaroidViewModal';
import {
  requestReminderPermission,
  scheduleDailyReminder,
  cancelDailyReminder,
  regenerateAwarenessCueSchedule,
  cancelAwarenessCueSchedule,
} from '../../lib/reminders';
import { isReviewAvailable, requestReview } from '../../lib/rateUs';
import { RNR_SLOTS, RNR_SLOT_LABELS } from '../../lib/rnrs';
import { BUTTON_HEIGHT, BUTTON_HIT_SLOP } from '../../lib/buttonSize';
import { useRnrDay } from '../../lib/useRnrDay';
import { fetchRecentDayDots, dayDotPhase, saveDayDot, skipDayDot, DAY_DOTS_TRAIL_DAYS } from '../../lib/dayDots';
import HomeDayDotsCard, { DayDotsSkipPill, dayDotsSubLine } from '../../components/HomeDayDotsCard';

// Caps Home's content on tablet/wide screens so it doesn't stretch
// edge-to-edge -- wallpaper (painted by WallpaperBackground, behind
// this content) still fills the full screen width either way.
const HOME_CONTENT_MAX_WIDTH = 600;
// styles.content's padding on each side; also used to work out the
// content width the deck has to fit in.
const HOME_SIDE_PADDING = 20;
// Space (dp) between the buttons row (or the tester pill, when it shows)
// and the front deck card. Nudge here.
const DECK_GAP = 38;
// Clear space (dp) between the deck's dots and arrows row and the top of
// the tab bar, at the default text size. The deck's height flexes to
// keep it (components/HomeDeck.js, DECK_MIN_HEIGHT / DECK_MAX_HEIGHT).
const SPARE_ROOM = 20;
// Multickles card: title and its Follow / Mine switch (pill chips).
const MULTICKLES_CARD_TITLE = 'Blogbits';
const MULTICKLES_VIEWS = [
  { key: 'follow', label: 'Follow' },
  { key: 'mine', label: 'Mine' },
];
// The app-wide pill (lib/buttonSize.js): 30dp, 44dp to tap.
const MULTICKLES_CHIP_HEIGHT = BUTTON_HEIGHT;
const MULTICKLES_CHIP_HIT_SLOP = BUTTON_HIT_SLOP;
const MULTICKLES_CHIP_PADDING = 12;
const MULTICKLES_CHIP_GAP = 8; // between the two chips
const MULTICKLES_CHIP_FONT_SIZE = 14;
const MULTICKLES_CHIP_SELECTED_FILL = '#FFF8EC';
const MULTICKLES_CHIP_OUTLINE = 'rgba(255,248,236,0.22)';
const MULTICKLES_CHIP_TEXT = '#FFF8EC';
// Home's vertical gaps (dp), kept tight so the whole page fits above the
// tab bar at the default text size.
const TITLE_ROW_GAP = 4; // under the header row
const PROFILE_ROW_GAP = 12; // under the profile row
const VIBE_CARDS_GAP = 4; // under the Vibe cards
const VIBE_LABELS_GAP = 10; // under the Vibe labels
const MOJO_PADDING_V = 8; // Mojo Shared panel, top and bottom padding
const MOJO_CAPTION_GAP = 6; // under "Mojo Shared"
// "Mojo Shared" caption.
const MOJO_CAPTION_FONT_SIZE = 14;
const MOJO_CAPTION_COLOR = '#4A1F10';
const MOJO_PILLS_GAP = 4; // between the Mojo pills and their labels
const MOJO_PANEL_GAP = 12; // under the Mojo panel, above the buttons
// Below the dots and arrows row, added to the tab bar's own height.
const CONTENT_BOTTOM_EXTRA = 8;
// How many Tickles the Remember this? card offers at most.
const REMEMBER_MAX = 3;
// Columns loadEntries reads, and a Quick Tickle's insert returns, so the
// new row drops straight into `entries` in the same shape.
const HOME_ENTRY_SELECT =
  'id, entry_date, text_content, like_count, goal_id, tickle_nature, visibility, is_edited, created_at, user_id, entry_kind, local_photo_filename, media_url, quick_note';

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

// "just now" / "5 minutes ago" / "3 hours ago" / "yesterday" / "4 days
// ago", from an ISO timestamp. Elapsed time, not calendar days.
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

// "Remember this?" picks: up to REMEMBER_MAX distinct past Tickles of the
// user's own, stable for the whole local day, rotating the next. Pure
// function of the already-loaded entries -- no query, no storage, no
// profile write. Tiers are tried in order and fill the picks until
// there are enough; within a tier, candidates are sorted by id and
// walked from an index set by a hash of userId + today, so a refocus
// later the same day lands on the same entries (and the first pick is
// the one the single-card version showed). My Day (day_journal) entries
// are eligible like any Vibe. Returns { entries, isFallback } or null.
function pickRememberEntries(entries, userId) {
  const today = localDateString(0);
  const past = entries.filter((e) => e.entry_date < today);

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

  const seed = hashString(`${userId}${today}`);
  const picked = [];
  for (const matches of tiers) {
    // Tiers overlap (the last one covers every week-old entry), so skip
    // anything an earlier tier already picked.
    const candidates = past
      .filter((e) => matches(e) && !picked.includes(e))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (let i = 0; i < candidates.length && picked.length < REMEMBER_MAX; i++) {
      picked.push(candidates[(seed + i) % candidates.length]);
    }
    if (picked.length === REMEMBER_MAX) break;
  }
  if (picked.length) return { entries: picked, isFallback: false };

  // Thin history: the latest Tickle instead (today's included).
  const latest = entries[0];
  return latest ? { entries: [latest], isFallback: true } : null;
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
  // The chosen Home colour set (lib/homePalette.js): deck card colours,
  // their row fills (worked out once per set) and the Vibe card colours.
  const { deck: deckColors, vibe: vibeColors, rowFill } = useHomePalette();
  // Which deck cards are switched on (Settings, Home cards;
  // lib/homeCards.js). A hidden card's own data isn't loaded, and the
  // deck doesn't wait for it.
  const {
    remember: rememberOn, goals: goalsOn, rewards: rewardsOn,
    multickles: multicklesOn, rnrs: rnrsOn, dayDots: dayDotsOn,
    polaroids: polaroidsOn, trackers: trackersOn,
  } = homeCardsFor(profile);
  // A new account that hasn't picked its cards yet (home_cards null, once
  // the profile has loaded): Home shows the Pick your cards card in the
  // deck's place, and every card above is off, so no card data loads.
  const cardsChosen = homeCardsChosen(profile);
  // The Pick your cards sheet (components/PickCardsSheet.js).
  const [pickSheetOpen, setPickSheetOpen] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Flexible deck (see SPARE_ROOM): the page's measured height (the
  // window height until it's measured), where the content column starts,
  // and where the deck starts inside it -- all with the page at the top.
  const [pageHeight, setPageHeight] = useState(0);
  const [innerTop, setInnerTop] = useState(null);
  const [deckTop, setDeckTop] = useState(null);

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
  // Pull-down refresh spinner, separate from `loading` (see handleRefresh).
  const [refreshing, setRefreshing] = useState(false);
  // A failed load shows its own message, and hides Quick start, so an
  // account whose Tickles just didn't load isn't treated as having none.
  const [loadError, setLoadError] = useState(false);
  const [goals, setGoals] = useState([]);
  // This week's Nailed it! taps ({ goal_id, created_at }), for the Your
  // Goals rows' weekly target circles. [] until loaded or on a failure.
  const [goalWeekLogs, setGoalWeekLogs] = useState([]);
  // Map<entryId, uri> -- resolved display image for every currently-
  // loaded entry that has one (photo_only, or a text entry with a
  // Tickle-a-Photo link), see resolveLinkedPhotoUris above.
  const [linkedPhotoUris, setLinkedPhotoUris] = useState(new Map());
  const [tokenBalance, setTokenBalance] = useState(0);
  const [rewardItems, setRewardItems] = useState([]);
  const [followedTales, setFollowedTales] = useState([]);
  // True once that source's fetch has succeeded, so an empty section's
  // placeholder pill never shows before its data is in (or after a
  // failed fetch, which keeps today's hide-the-section behaviour).
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [rewardsLoaded, setRewardsLoaded] = useState(false);
  const [followedTalesLoaded, setFollowedTalesLoaded] = useState(false);
  // Multickles card: which list shows ('follow' or 'mine'). Kept in
  // memory only (resets when Home is rebuilt), never stored on disk.
  const [multicklesView, setMulticklesView] = useState('follow');
  // "Find a Blogbit" pop-up (components/FindBlogbitsPopup.js), opened by
  // the Blogbits card's + while Follow is selected.
  const [findBlogbitsOpen, setFindBlogbitsOpen] = useState(false);
  // The user's own Multickles (fetchMyTales), for the card's Mine list.
  // myTalesState: 'loading' until the first read answers, then 'loaded'
  // or 'error'.
  const [myTales, setMyTales] = useState([]);
  const [myTalesState, setMyTalesState] = useState('loading');
  // Today's Routines and Reminders, for the deck's Nudges & Notes card. Read only:
  // the shared hook's load (the same one the pop-up and full page use),
  // none of its write functions. enabled=false, so it only loads when
  // loadRnrToday asks (Home focus, pull-down refresh). rnrLoaded: that
  // load has finished (failed included -- the card then says so).
  const rnrDay = useRnrDay(session?.user?.id, localDateString(0), false);
  const [rnrLoaded, setRnrLoaded] = useState(false);
  const reloadRnrDay = rnrDay.reload;
  const loadRnrToday = useCallback(async () => {
    if (!rnrsOn) return;
    await reloadRnrDay();
    setRnrLoaded(true);
  }, [reloadRnrDay, rnrsOn]);
  // Today's pop-up (components/RnrsPopup.js), opened from the card's tile
  // rows. A Modal doesn't change Home's focus, so closing it reloads the
  // card here -- unless it closed to go to the full page, where coming
  // back to Home reloads it anyway.
  const [rnrsPopupOpen, setRnrsPopupOpen] = useState(false);
  // Home's entries are re-read on every close too: a Quick Note logged in
  // the pop-up is a Tickle, so the Vibe numbers and streak include it.
  function closeRnrsPopup({ leaving } = {}) {
    setRnrsPopupOpen(false);
    if (!leaving) loadRnrToday();
    loadEntries();
  }
  // Day Dots card (the deck's How bright is your day? card). { date, phase, dotIndex?, rows }
  // -- date is the local day it was loaded for (a tap on a Home left open
  // past midnight re-reads instead of saving, as My Day's picker did);
  // phase/dotIndex are today's, from lib/dayDots.js dayDotPhase; rows is
  // the Map of today's and the 4 days before's day_dots rows by LOCAL
  // date, or null when that read failed (the card then shows today's
  // dot only, no trail). null until the first read answers.
  const [dayDots, setDayDots] = useState(null);
  const [dayDotsLoaded, setDayDotsLoaded] = useState(false);
  // Day Dots writes go one at a time: busy while one is in flight, and
  // pending holds the newest dotIndex tapped meanwhile (only the newest is
  // kept). dayDotConfirmed is today's last state the server confirmed
  // ({ phase, dotIndex? }, from a read or a successful write) -- what a
  // failed write puts the card back to.
  const dayDotWrite = useRef({ busy: false, pending: null });
  const dayDotConfirmed = useRef(null);
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
  // Quick Tickle: the Vibe popover, the insert in flight (rows and the
  // dot button are disabled meanwhile), and the toast for the row just
  // logged ({ id, label } or null).
  const [quickPopoverOpen, setQuickPopoverOpen] = useState(false);
  // "Nailed it!" popup (components/NailedItPopup.js), opened from the QG
  // button on Your Goals.
  const [nailedOpen, setNailedOpen] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickToast, setQuickToast] = useState(null);
  const quickDotRef = useRef(null);
  // Popover placement: the dot's measureInWindow box (see
  // components/QuickTicklePopover.js).
  const [quickAnchor, setQuickAnchor] = useState(null);

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
      .select(HOME_ENTRY_SELECT)
      .eq('user_id', session.user.id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });

    setLoadError(!!error);
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
    if (!session || !goalsOn) return;
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setGoals(data || []);
      setGoalsLoaded(true);
    }
  }, [session, goalsOn]);

  // This week's Nailed it! taps, for the weekly target circles. Fetched
  // from a day before the week starts (isThisWeek on each tap's local
  // date decides what counts), goal_id and created_at only. Same triggers
  // as loadGoals, plus after each Nailed it! tap.
  const loadGoalWeekLogs = useCallback(async () => {
    if (!session || !goalsOn) return;
    const weekStart = Date.parse(currentWeekStartISO(profile?.week_start_day ?? DEFAULT_WEEK_START_DAY));
    const since = new Date(weekStart - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await listRecentGoalLogs(since);
    if (!error) setGoalWeekLogs(data || []);
  }, [session, goalsOn, profile?.week_start_day]);

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
      loadGoalWeekLogs();
    }, [loadGoals, loadGoalWeekLogs])
  );

  useFocusEffect(
    useCallback(() => {
      loadRnrToday();
    }, [loadRnrToday])
  );

  useFocusEffect(
    useCallback(() => {
      loadCaptionShareTotals();
    }, [loadCaptionShareTotals])
  );

  // Day Dots: one read of today and the 4 days before (local dates), on
  // every Home focus, pull-down refresh and the stale-day re-read -- not
  // after a save, whose optimistic state is already right. A failed read
  // keeps today as 'open' (as My Day's picker did) and drops the trail.
  // While a write is in flight or queued, the read only updates the trail
  // rows, never today's phase, so it can't put back an older size.
  const loadDayDots = useCallback(async () => {
    if (!session || !dayDotsOn) return;
    const today = localDateString(0);
    const rows = await fetchRecentDayDots(session.user.id);
    const w = dayDotWrite.current;
    if (w.busy || w.pending != null) {
      setDayDots((prev) => (prev && prev.date === today ? { ...prev, rows } : prev));
    } else {
      const todayState = dayDotPhase(rows?.get(today));
      dayDotConfirmed.current = todayState;
      setDayDots({ date: today, ...todayState, rows });
    }
    setDayDotsLoaded(true);
  }, [session, dayDotsOn]);

  useFocusEffect(
    useCallback(() => {
      loadDayDots();
    }, [loadDayDots])
  );

  // Polaroids sent card: the newest Polaroids sent from Tickle Pics on
  // this phone, with small cached thumbnails (lib/polaroidsSent.js).
  // Only loaded while the card is switched on, on every Home focus and
  // pull-down refresh. A failed read shows the empty state.
  // viewPolaroid: the one open larger (PolaroidViewModal), or null.
  const [sentPolaroids, setSentPolaroids] = useState([]);
  const [sentPolaroidsLoaded, setSentPolaroidsLoaded] = useState(false);
  const [viewPolaroid, setViewPolaroid] = useState(null);
  const loadPolaroids = useCallback(async () => {
    if (!session || !polaroidsOn) return;
    try {
      setSentPolaroids(await loadSentPolaroids(session.user.id));
    } catch {
      setSentPolaroids([]);
    }
    setSentPolaroidsLoaded(true);
  }, [session, polaroidsOn]);

  useFocusEffect(
    useCallback(() => {
      loadPolaroids();
    }, [loadPolaroids])
  );

  // Your trackers card: the user's private trackers (lib/trackers.js) with
  // today's rating each. Only read while the card is switched on, on every
  // Home focus and pull-down refresh. trackersState: 'loading', 'loaded'
  // or 'error' (the card then says so). Never logged.
  const [trackers, setTrackers] = useState([]);
  const [trackersToday, setTrackersToday] = useState(new Map());
  const [trackersState, setTrackersState] = useState('loading');
  const loadTrackers = useCallback(async () => {
    if (!session || !trackersOn) return;
    const today = localDateString(0);
    const { trackers: list, error } = await listTrackers(session.user.id);
    if (error) {
      setTrackersState('error');
      return;
    }
    const { ratings, error: ratingsError } = await listRatings(session.user.id, list.map((t) => t.id), today);
    if (ratingsError) {
      setTrackersState('error');
      return;
    }
    setTrackers(list);
    setTrackersToday(new Map(list.map((t) => [t.id, ratings.get(t.id)?.get(today) ?? null])));
    setTrackersState('loaded');
  }, [session, trackersOn]);

  useFocusEffect(
    useCallback(() => {
      loadTrackers();
    }, [loadTrackers])
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
    if (!rewardsOn) return;
    if (!session || !tokensEnabled) {
      setTokenBalance(0);
      setRewardItems([]);
      setRewardsLoaded(false);
      return;
    }
    try {
      const [balance, items] = await Promise.all([fetchTokenBalance(), fetchWishlistItems()]);
      setTokenBalance(balance);
      setRewardItems(items || []);
      setRewardsLoaded(true);
    } catch {
      // Best-effort -- a failed fetch just hides the strip.
      setRewardItems([]);
      setRewardsLoaded(false);
    }
  }, [session, tokensEnabled, rewardsOn]);

  // Nailed it! is a tokens feature: if Tokens & Rewards goes off while
  // its popup is open, close it (the QG button is gone too).
  useEffect(() => {
    if (!tokensEnabled) setNailedOpen(false);
  }, [tokensEnabled]);

  useFocusEffect(
    useCallback(() => {
      loadRewards();
    }, [loadRewards])
  );

  // "Multickles you follow": one pill per followed Multickle that's still
  // Ongoing (not completed_at, the same field tale.js's Ongoing/Complete
  // pill uses), with a sparkle on any that has an unread tale_chapter
  // notification. Its own two fetches in parallel (see
  // home_multickles_card_audit.md): the unread Tic notifications, and
  // fetchFollowedTales -- which also drops Multickles since unfollowed
  // (their notifications stay unread, users can't delete them). The full
  // followed list, completed ones included, lives on Tickle Stash's
  // Following tab. Order: new
  // Tics first, newest unread first; then the rest in fetchFollowedTales'
  // newest-follow-first order -- tales has no last-Tic/updated_at column,
  // so there's no cheaper activity date to sort by. Read-only: tale.js
  // marks the notifications read when the Multickle is opened, never
  // Home. Best-effort -- any failure just clears the state and hides it.
  const loadFollowedTales = useCallback(async () => {
    if (!multicklesOn) return;
    if (!session) {
      setFollowedTales([]);
      setFollowedTalesLoaded(false);
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
          // back, so don't flash the sparkle back in. A newer Tic still
          // shows it.
          const tappedAt = tappedTaleNewAtRef.current.get(t.id);
          if (newAt && tappedAt && new Date(newAt) <= new Date(tappedAt)) newAt = null;
          return { id: t.id, title: t.title, newAt };
        });
      const withNews = pills.filter((t) => t.newAt).sort((a, b) => new Date(b.newAt) - new Date(a.newAt));
      setFollowedTales([...withNews, ...pills.filter((t) => !t.newAt)]);
      setFollowedTalesLoaded(true);
    } catch {
      setFollowedTales([]);
      setFollowedTalesLoaded(false);
    }
  }, [session, multicklesOn]);

  useFocusEffect(
    useCallback(() => {
      loadFollowedTales();
    }, [loadFollowedTales])
  );

  // Read only, the same read as Manage Multickles (app/tales.js): every
  // own Multickle, Ongoing first then Completed, newest first.
  const loadMyTales = useCallback(async () => {
    if (!session || !multicklesOn) return;
    try {
      setMyTales(await fetchMyTales(session.user.id, { throwOnError: true }));
      setMyTalesState('loaded');
    } catch {
      setMyTalesState('error');
    }
  }, [session, multicklesOn]);

  useFocusEffect(
    useCallback(() => {
      loadMyTales();
    }, [loadMyTales])
  );

  // Pull-down refresh: re-runs Home's own focus loaders. Entries feed the
  // Vibe cards, Ripples pill, Remember this? and Goal pill counts; the
  // caption totals feed the two Mojo Shared pills. loadEntries never sets
  // `loading`, so the page stays put, and a failure shows its existing
  // "Couldn't load your Tickles" text.
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        refreshProfile(),
        loadEntries(),
        loadGoals(),
        loadGoalWeekLogs(),
        loadCaptionShareTotals(),
        loadRewards(),
        loadFollowedTales(),
        loadMyTales(),
        loadRnrToday(),
        loadDayDots(),
        loadPolaroids(),
        loadTrackers(),
        loadPaceReminder(),
        loadOptInReminder(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  // Achieved goals are left out of Home's "Your Goals" card -- they keep
  // their row (and their color on already-tagged entries) but are no
  // longer something being worked on.
  const activeGoals = goals.filter((g) => !g.achieved_at);

  // Same scroll-to-and-highlight mechanism notifications.js already
  // uses to jump into Tickle Stash's Mine tab at a specific entry.
  function goToEntryInFeed(entryId) {
    router.push({ pathname: '/feed', params: { tab: 'mine', highlightEntry: entryId } });
  }

  // Quick Tickle (the dot button beside New Tickle): one tap logs a
  // private, text-less Tickle in the picked Vibe. text_content is null,
  // never '' (see lib/quickTickle.js). No goal, Multickle or photo, so it
  // earns no token, sends no Tic notification and uses no Ripple cap.
  // The new row goes straight into `entries`, so the Vibe numbers and
  // lightbulbs update without a reload.
  async function handleQuickTickle(nature) {
    if (quickSaving || !session) return;
    setQuickSaving(true);
    setQuickPopoverOpen(false);
    setQuickToast(null);
    const { data, error } = await insertQuickTickle(session.user.id, nature, HOME_ENTRY_SELECT);
    setQuickSaving(false);
    if (error || !data) {
      console.warn('handleQuickTickle: insert failed', error);
      showSaveFailed();
      return;
    }
    // Newest first, the order loadEntries uses.
    setEntries((prev) => [data, ...prev]);
    setQuickToast({ id: data.id, label: NATURE_LABELS[nature] });
  }

  // Measures the dot first, so the sheet opens already anchored to it.
  // Without a measurement the sheet falls back to the screen's centre.
  function openQuickPopover() {
    setQuickToast(null);
    const dot = quickDotRef.current;
    if (!dot?.measureInWindow) {
      setQuickAnchor(null);
      setQuickPopoverOpen(true);
      return;
    }
    dot.measureInWindow((x, y, width, height) => {
      setQuickAnchor(width > 0 ? { x, y, width, height } : null);
      setQuickPopoverOpen(true);
    });
  }

  // TalkBack focus back on the dot button once the toast has gone.
  function focusQuickDot() {
    if (quickDotRef.current) AccessibilityInfo.sendAccessibilityEvent(quickDotRef.current, 'focus');
  }

  function handleQuickToastTimeout() {
    setQuickToast(null);
    focusQuickDot();
  }

  // Deletes just the row this toast logged, by id. Nothing else needs
  // undoing: its insert fired no notification, token or cap, and every
  // count on Home is worked out from `entries`.
  async function handleQuickUndo() {
    const toast = quickToast;
    if (!toast) return;
    const previous = entries;
    setQuickToast(null);
    setEntries((prev) => prev.filter((e) => e.id !== toast.id));
    const { error } = await supabase.from('tickle_entries').delete().eq('id', toast.id);
    if (error) {
      setEntries(previous);
      showSaveFailed();
    } else {
      AccessibilityInfo.announceForAccessibility('Removed');
      forgetQuickTickle(toast.id);
    }
    focusQuickDot();
  }

  // The existing Edit route, same as the ⋯ menu's Edit.
  function handleQuickTickleIt() {
    const toast = quickToast;
    if (!toast) return;
    setQuickToast(null);
    router.push({ pathname: '/create', params: { entryId: toast.id } });
  }

  // Leaving Home closes the popover and the toast (with TalkBack on, the
  // toast doesn't hide by itself).
  useFocusEffect(
    useCallback(() => () => {
      setQuickPopoverOpen(false);
      setQuickToast(null);
    }, [])
  );

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
    if (isThisWeek(e.entry_date, rippleWeekStartDay)) vibeWeekCounts[nature]++;
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

  // Both bottom cards below are derivations of the already-loaded
  // entries/goals (see home_bottom_redesign_audit.md); Your Goals' weekly
  // target circles also use the goal_logs query (goalWeekLogs, this
  // week's Nailed it! taps). Goal counts are disjoint: goal_id is a single
  // column, so an entry counts toward at most one Goal.
  const remember = session ? pickRememberEntries(entries, session.user.id) : null;
  // goalWeekCounts feeds the weekly-target circle (goals.weekly_target):
  // same entry_date + week_start_day boundary as Weekly Summary's
  // per-Goal count and the weekly caps (lib/week.js), and the same
  // no-filter semantics as goalCounts, just limited to this week.
  const goalCounts = new Map();
  const goalWeekCounts = new Map();
  for (const e of entries) {
    if (!e.goal_id) continue;
    goalCounts.set(e.goal_id, (goalCounts.get(e.goal_id) || 0) + 1);
    if (isThisWeek(e.entry_date, rippleWeekStartDay)) {
      goalWeekCounts.set(e.goal_id, (goalWeekCounts.get(e.goal_id) || 0) + 1);
    }
  }
  // Nailed it! taps count toward the weekly target too (not toward
  // goalCounts, the "N Tickles" number): each tap's local date, same
  // isThisWeek boundary as the entries above.
  for (const l of goalWeekLogs) {
    if (isThisWeek(toLocalDateString(new Date(l.created_at)), rippleWeekStartDay)) {
      goalWeekCounts.set(l.goal_id, (goalWeekCounts.get(l.goal_id) || 0) + 1);
    }
  }

  // The four old bottom sections, plus Routines and Reminders, are the
  // cards of one deck (components/HomeDeck.js). Each card's rows are what
  // its old pill row showed, as vertical rows in cream on the card
  // colour. Each row is its own touchable and opens what its pill opened.

  // One dashed, untappable row for a card with nothing to show. No text,
  // and hidden from screen readers so TalkBack doesn't announce it.
  function renderPlaceholderRow() {
    return (
      <View
        style={deckRowStyles.placeholder}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    );
  }

  // Remember this?: a tap jumps to the entry in Tickle Stash, where
  // Share/Edit/Ripple/Delete live. Photo-only entries have no text, so
  // they show a small thumbnail and the Vibe name instead. With no
  // Tickles yet, remember is null: "Your latest Tickle" over a
  // placeholder row.
  function rememberCard() {
    return {
      key: 'remember',
      title: !remember || remember.isFallback ? 'Your latest Tickle' : 'Remember this?',
      color: deckColors.remember,
      children: !remember ? renderPlaceholderRow() : remember.entries.map((entry) => {
        const isPhotoOnly = entry.entry_kind === 'photo_only';
        const photoUri = isPhotoOnly ? linkedPhotoUris.get(entry.id) || null : null;
        const natureLabel = NATURE_LABELS[entry.tickle_nature] || 'Tickle';
        // Newlines and runs of spaces collapsed, so the two lines start
        // at the beginning of the entry text. A Quick Note has no text, so
        // the nudge's words (quick_note) stand in for it.
        const text = (entry.text_content || entry.quick_note || '').replace(/\s+/g, ' ').trim();
        const label = !isPhotoOnly && text ? text : natureLabel;
        // A Quick Tickle (no text, no note, no photo) is read as just its Vibe.
        const short = !isPhotoOnly && !text
          ? null
          : isPhotoOnly
            ? 'a photo'
            : text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text;
        return (
          <TouchableOpacity
            key={entry.id}
            style={[deckRowStyles.row, rowFill.remember]}
            activeOpacity={0.7}
            onPress={() => goToEntryInFeed(entry.id)}
            accessibilityRole="button"
            accessibilityLabel={short ? `${natureLabel}, ${short}. Opens Tickle.` : `${natureLabel}. Opens Tickle.`}
          >
            {!!entry.tickle_nature && (
              <NatureIcon nature={entry.tickle_nature} size={16} color={DECK_TEXT} />
            )}
            {isPhotoOnly && (
              photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.rememberThumb} />
              ) : (
                <View style={[styles.rememberThumb, styles.rememberThumbMissing]}>
                  <Ionicons name="image-outline" size={14} color={C.faint} />
                </View>
              )
            )}
            <Text style={deckRowStyles.label} numberOfLines={2}>{label}</Text>
          </TouchableOpacity>
        );
      }),
    };
  }

  // My Rewards: every reward on the Reward List, in fetchWishlistItems'
  // cost-ascending order, each with a circle that fills once the balance
  // reaches its cost. Rewards are repeatable (redeeming never removes
  // one, see migration 0065). Redeeming itself stays on the Reward List
  // with its own confirmation -- every row, the out-of-reach ones
  // included, just opens it, as does the + in the header's corner. The
  // token total is the sub line; its screen-reader label
  // names only the affordable rewards, and reads just the balance when
  // none are. With no rewards at all, a placeholder row.
  const affordableRewards = tokensEnabled ? rewardItems.filter((i) => i.cost <= tokenBalance) : [];

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  function rewardsCard() {
    const balanceText = `${tokenBalance} token${tokenBalance === 1 ? '' : 's'}`;
    const subA11y = affordableRewards.length === 0
      ? `${balanceText}.`
      : `${balanceText}. You can redeem ${joinNames(affordableRewards.map((i) => i.label))}.`;
    return {
      key: 'rewards',
      title: 'My Rewards',
      sub: balanceText,
      subA11y,
      color: deckColors.rewards,
      headerAdd: { a11yLabel: 'Add a reward. Opens Reward List.', onPress: () => router.push('/wishlist') },
      children: rewardItems.length === 0 ? renderPlaceholderRow() : rewardItems.map((item) => {
        const canRedeem = item.cost <= tokenBalance;
        const short = item.cost - tokenBalance;
        const stateA11y = canRedeem
          ? 'Can redeem'
          : `Needs ${short} more token${short === 1 ? '' : 's'}`;
        return (
          // Name and cost in separate Texts so only the name truncates.
          <TouchableOpacity
            key={item.id}
            style={[deckRowStyles.row, rowFill.rewards]}
            activeOpacity={0.7}
            onPress={() => router.push('/wishlist')}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}, ${item.cost} token${item.cost === 1 ? '' : 's'}. ${stateA11y}. Opens Reward List.`}
          >
            <Text style={deckRowStyles.label} numberOfLines={1}>{item.label}</Text>
            <View style={deckRowStyles.spacer} />
            <MaterialCommunityIcons name="circle-multiple-outline" size={14} color={DECK_SUBTEXT} />
            <Text style={deckRowStyles.meta}>{item.cost}</Text>
            {/* Hollow cream ring below the cost, solid cream with a tick
                in the card colour once affordable. */}
            <View style={[styles.rewardCircle, canRedeem && styles.rewardCircleFilled]}>
              {canRedeem && <Ionicons name="checkmark" size={13} color={deckColors.rewards} />}
            </View>
          </TouchableOpacity>
        );
      }),
    };
  }

  // Tapping a row opens the Multickle and clears its sparkle locally, in
  // place -- no re-order or removal; tale.js marks the notifications
  // read. The newest unread created_at it was showing is remembered, so a
  // Home focus that beats that mark-read doesn't bring the sparkle back,
  // while a newer Tic still does.
  function openFollowedTale(tale) {
    if (tale.newAt) {
      tappedTaleNewAtRef.current.set(tale.id, tale.newAt);
      setFollowedTales((prev) => prev.map((t) => (t.id === tale.id ? { ...t, newAt: null } : t)));
    }
    router.push({ pathname: '/tale', params: { id: tale.id } });
  }

  // Follow / Mine switch at the right of the Blogbits card's title, in
  // the card's wrapping header row (it wraps under the title at large
  // font scales), then a round +. On Mine the + opens Manage Blogbits to
  // start one; on Follow it opens "Find a Blogbit", a list of Blogbits
  // the user could follow. Only Follow or Mine is selected; Follow when
  // Home opens. The + stays in this group, so it wraps with them.
  function renderMulticklesSwitch() {
    const onFollow = multicklesView === 'follow';
    return (
      <View style={styles.multicklesSwitch}>
        {MULTICKLES_VIEWS.map(({ key, label }) => {
          const selected = multicklesView === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setMulticklesView(key)}
              hitSlop={MULTICKLES_CHIP_HIT_SLOP}
              activeOpacity={0.7}
              style={[styles.multicklesChip, selected ? styles.multicklesChipSelected : styles.multicklesChipIdle]}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.multicklesChipText, selected && { color: deckColors.multickles }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={onFollow ? () => setFindBlogbitsOpen(true) : () => router.push('/tales')}
          hitSlop={HEADER_ADD_HIT_SLOP}
          activeOpacity={0.7}
          style={[styles.multicklesChip, styles.multicklesChipIdle, styles.multicklesAdd]}
          accessibilityRole="button"
          accessibilityLabel={onFollow ? 'Find a Blogbit' : 'Create a Blogbit'}
          accessibilityHint={onFollow ? 'Opens a list of Blogbits you can follow' : undefined}
        >
          <Ionicons name="add" size={HEADER_ADD_ICON_SIZE} color={MULTICKLES_CHIP_TEXT} />
        </TouchableOpacity>
      </View>
    );
  }

  // Mine: the user's own ongoing Multickles (completed ones left out, as
  // in Follow), in fetchMyTales' order, same row look as Follow. A tap
  // opens the Multickle screen, as Manage Multickles' rows do.
  function renderMyTaleRows() {
    if (myTalesState === 'loading') return renderPlaceholderRow();
    if (myTalesState === 'error') {
      return <Text style={deckRowStyles.body}>Couldn't load your Blogbits — please try again later.</Text>;
    }
    const ongoing = myTales.filter((t) => !t.completed_at);
    if (ongoing.length === 0) return <Text style={deckRowStyles.body}>You have no ongoing Blogbits.</Text>;
    return ongoing.map((t) => (
      <TouchableOpacity
        key={t.id}
        style={[deckRowStyles.row, rowFill.multickles]}
        activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/tale', params: { id: t.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${t.title}. Opens Blogbit.`}
      >
        <Text style={deckRowStyles.label} numberOfLines={1}>{t.title}</Text>
      </TouchableOpacity>
    ));
  }

  function multicklesCard() {
    return {
      key: 'multickles',
      title: MULTICKLES_CARD_TITLE,
      color: deckColors.multickles,
      headerRight: renderMulticklesSwitch(),
      children: multicklesView === 'mine' ? renderMyTaleRows() : followedTales.length === 0 ? (
        <Text style={deckRowStyles.body}>You are not following any Blogbits yet.</Text>
      ) : followedTales.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={[deckRowStyles.row, rowFill.multickles]}
          activeOpacity={0.7}
          onPress={() => openFollowedTale(t)}
          accessibilityRole="button"
          accessibilityLabel={
            t.newAt
              ? `${t.title}, new Tic added ${relativeTimeLabel(t.newAt)}. Opens Blogbit.`
              : `${t.title}. Opens Blogbit.`
          }
        >
          {/* Unread indicator. Hidden from screen readers -- the row's
              label already says "new Tic added ...". */}
          {!!t.newAt && (
            <Ionicons
              name="sparkles"
              size={14}
              color={DECK_TEXT}
              importantForAccessibility="no"
              accessibilityElementsHidden
            />
          )}
          <Text style={deckRowStyles.label} numberOfLines={1}>{t.title}</Text>
        </TouchableOpacity>
      )),
    };
  }

  // Your Goals: one row per active Goal -> that Goal's own summary screen
  // (app/goal.js). With no active Goals, a gentle prompt instead -- but
  // before the first entry a placeholder row, so a brand-new account isn't
  // shown two calls to action at once (QuickStartCard already covers that
  // state). The header's + (Add a Goal) shows in every state all the
  // same. Before the first entry the card also waits for the Goals to
  // load, and stays hidden after a failed entries load, where every row's
  // count would wrongly read 0.
  const showGoalsCard = entries.length > 0 || (!loadError && (activeGoals.length > 0 || goalsLoaded));

  // Every card shows once its data is in, a placeholder row standing in
  // when it's empty. Your latest Tickle waits on the entries load (the
  // caller's !loading) and is hidden after a failed one, which shows its
  // own "Couldn't load" text instead. My Rewards stays hidden while
  // Tokens & Rewards is off.
  const showRememberCard = !!remember || !loadError;
  const showRedeemCard = tokensEnabled && rewardsLoaded;
  const showFollowedTalesCard = followedTalesLoaded;

  function goalsCard() {
    let children;
    if (activeGoals.length === 0 && entries.length === 0) {
      children = renderPlaceholderRow();
    } else if (activeGoals.length === 0) {
      children = (
        <>
          <Text style={deckRowStyles.body}>
            Working towards something? Add a Goal, then tag Tickles to it as you go.
          </Text>
          <Button title="Add a Goal" onPress={() => router.push('/goals')} variant="secondary" />
        </>
      );
    } else {
      children = activeGoals.map((g) => {
        const count = goalCounts.get(g.id) || 0;
        // A Goal with a weekly target shows this week's count in a
        // GoalTargetCircle instead of the all-time count. Only the a11y
        // label says "of N" -- visually it's just the number (or a tick).
        const target = g.weekly_target;
        const weekCount = goalWeekCounts.get(g.id) || 0;
        const countLabel = !target
          ? `${count} Tickle${count === 1 ? '' : 's'}`
          : weekCount >= target
            // Not "Tickles": the week count includes Nailed it! taps.
            ? `${weekCount} this week, target reached`
            : `${weekCount} of ${target} this week`;
        // Hidden when the Tokens master switch is off, same "!== false"
        // idiom as CornerNav's showTokens.
        const showCoin = g.earns_tokens && profile?.tokens_enabled !== false;
        return (
          <TouchableOpacity
            key={g.id}
            style={[deckRowStyles.row, rowFill.goals]}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: '/goal', params: { id: g.id } })}
            accessibilityRole="button"
            accessibilityLabel={
              `${g.label}, ${countLabel}` +
              `${showCoin ? ', earns tokens' : ''}. Opens Goal summary.`
            }
          >
            {/* The Goal's own colour, which the old pill carried in its
                tint and border, as a small dot. */}
            <View style={[styles.goalColorDot, { backgroundColor: g.color }]} />
            <Text style={deckRowStyles.label} numberOfLines={1}>{g.label}</Text>
            <View style={deckRowStyles.spacer} />
            {showCoin && (
              <MaterialCommunityIcons name="circle-multiple-outline" size={14} color={DECK_SUBTEXT} />
            )}
            {target ? (
              <GoalTargetCircle
                count={weekCount}
                target={target}
                size={22}
                accessible={false}
                color={DECK_TEXT}
                tickColor={deckColors.goals}
              />
            ) : (
              <Text style={deckRowStyles.meta}>{count}</Text>
            )}
          </TouchableOpacity>
        );
      });
    }
    return {
      key: 'goals',
      title: 'Your Goals',
      color: deckColors.goals,
      headerAdd: { a11yLabel: 'Add a Goal', onPress: () => router.push('/goals') },
      // Nailed it! QG button, only while Tokens & Rewards is on (same
      // "!== false" idiom as the rows' coin).
      headerCoin: profile?.tokens_enabled !== false
        ? { a11yLabel: 'Nailed it! Log a Goal for a token', onPress: () => setNailedOpen(true) }
        : undefined,
      children,
    };
  }

  // Routines and Reminders: today's tiles under Morning, Afternoon and
  // Evening -- only the slots with tiles, as in the pop-up
  // (components/RnrsPopup.js). Read only here: every tile row opens that
  // pop-up, where Done, Move and Skip are. Done shows a tick, Skipped a
  // faded label and dashed outline, like RnrTile. Nothing today: the full
  // page's own line, and an "Add a Nudge or Note" row (the pop-up's says
  // "Add a tile"), which opens the full page like the pop-up's. The +
  // in the header opens the full page too, always.
  function openRnrs() {
    router.navigate('/rnrs');
  }

  function rnrsCard() {
    let children;
    const placements = rnrDay.placements;
    if (!rnrLoaded || (rnrDay.loading && placements.length === 0)) {
      children = renderPlaceholderRow();
    } else if (rnrDay.loadError && placements.length === 0) {
      children = <Text style={deckRowStyles.body}>Couldn't load your tiles — please try again later.</Text>;
    } else if (placements.length === 0) {
      children = (
        <>
          <Text style={deckRowStyles.body}>Plan a few small things for each part of your day.</Text>
          <TouchableOpacity
            style={[deckRowStyles.row, rowFill.rnrs]}
            activeOpacity={0.7}
            onPress={openRnrs}
            accessibilityRole="button"
            accessibilityLabel="Add a Nudge or Note. Opens Nudges & Notes."
          >
            <Ionicons name="add" size={16} color={DECK_TEXT} />
            <Text style={deckRowStyles.label} numberOfLines={2}>Add a Nudge or Note</Text>
          </TouchableOpacity>
        </>
      );
    } else {
      children = RNR_SLOTS.filter((s) => placements.some((p) => p.slot === s)).map((s) => (
        <View key={s} style={styles.rnrSlot}>
          <Text style={styles.rnrSlotLabel} accessibilityRole="header">{RNR_SLOT_LABELS[s]}</Text>
          {placements.filter((p) => p.slot === s).map((p) => {
            const done = p.status === 'done';
            const skipped = p.status === 'skipped';
            const stateWord = done ? ', done' : skipped ? ', skipped' : '';
            return (
              <TouchableOpacity
                key={p.id}
                style={[deckRowStyles.row, rowFill.rnrs, skipped && [styles.rnrRowSkipped, { backgroundColor: deckColors.rnrs }]]}
                activeOpacity={0.7}
                onPress={() => setRnrsPopupOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${p.label}, ${RNR_SLOT_LABELS[s]}${stateWord}. Opens today's tiles.`}
              >
                {done && <Ionicons name="checkmark-circle" size={18} color={DECK_TEXT} />}
                <Text style={[deckRowStyles.label, skipped && styles.rnrLabelSkipped]} numberOfLines={2}>{p.label}</Text>
                {(done || skipped) && (
                  <>
                    <View style={deckRowStyles.spacer} />
                    <Text style={styles.rnrState}>{done ? 'Done' : 'Skipped'}</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ));
    }
    return {
      key: 'rnrs',
      title: 'Nudges & Notes',
      color: deckColors.rnrs,
      headerAdd: { a11yLabel: 'Add a Nudge or Note', onPress: openRnrs },
      children,
    };
  }

  // Day Dots: today's dot (tap it to step up a size) and the
  // last 5 days' trail (components/HomeDayDotsCard.js), Skip in the
  // header. Saving is optimistic, like My Day's picker was: the card
  // changes at once and isn't re-read after a save. Writes go one at a
  // time (dayDotWrite); taps meanwhile only keep the newest size, sent
  // when the write in flight is done. A failed write stops the queue, puts
  // the card back to the last state the server confirmed and says so,
  // once. Today is the phone's local date at tap time; if that's no
  // longer the day the card was loaded for (Home left open past
  // midnight), the tap only re-reads.
  function dayDotsIsStale() {
    if (dayDots && dayDots.date === localDateString(0)) return false;
    loadDayDots();
    return true;
  }

  function dayDotWriteFailed() {
    const w = dayDotWrite.current;
    w.busy = false;
    w.pending = null;
    const c = dayDotConfirmed.current || { phase: 'open' };
    setDayDots((prev) => (prev ? { ...prev, phase: c.phase, dotIndex: c.dotIndex } : prev));
    showAlert("Couldn't save your Day Dot", 'Please try again.');
  }

  // Writes dotIndex, then whatever newer size was tapped meanwhile, until
  // none is left. The caller has already set busy.
  async function drainDayDotWrites(userId, date, firstIndex) {
    const w = dayDotWrite.current;
    let next = firstIndex;
    while (next != null) {
      const error = await saveDayDot(userId, date, next);
      if (error) {
        dayDotWriteFailed();
        return;
      }
      dayDotConfirmed.current = { phase: 'answered', dotIndex: next };
      const queued = w.pending;
      w.pending = null;
      next = queued != null && queued !== next ? queued : null;
    }
    w.busy = false;
  }

  async function handleDayDotSave(dotIndex) {
    if (!session || dayDotsIsStale()) return;
    if (dayDots.phase === 'answered' && dayDots.dotIndex === dotIndex) return;
    setDayDots((prev) => ({ ...prev, phase: 'answered', dotIndex }));
    const w = dayDotWrite.current;
    if (w.busy) {
      w.pending = dotIndex;
      return;
    }
    w.busy = true;
    await drainDayDotWrites(session.user.id, dayDots.date, dotIndex);
  }

  // Skip is an insert, so only while today has no row (the pill is
  // disabled otherwise), and never while a dot write is in flight. A dot
  // tapped during the skip's own write is queued and sent after it.
  async function handleDayDotSkip() {
    if (!session || dayDotsIsStale() || dayDots.phase !== 'open') return;
    const w = dayDotWrite.current;
    if (w.busy) return;
    w.busy = true;
    setDayDots((prev) => ({ ...prev, phase: 'skipped', dotIndex: undefined }));
    const userId = session.user.id;
    const date = dayDots.date;
    const error = await skipDayDot(userId, date);
    if (error) {
      dayDotWriteFailed();
      return;
    }
    dayDotConfirmed.current = { phase: 'skipped' };
    const queued = w.pending;
    w.pending = null;
    if (queued != null) await drainDayDotWrites(userId, date, queued);
    else w.busy = false;
  }

  function dayDotsCard() {
    // Before the first read: the not-dotted look, no trail.
    const phase = dayDots?.phase || 'open';
    let trail = null;
    if (dayDots?.rows) {
      // Counted back from the day the rows were read for (local dates),
      // so a Home left open past midnight still lines them up.
      trail = [];
      for (let back = DAY_DOTS_TRAIL_DAYS - 1; back >= 0; back--) {
        const d = parseLocalDateString(dayDots.date);
        d.setDate(d.getDate() - back);
        const date = toLocalDateString(d);
        trail.push({ date, row: dayDots.rows.get(date) });
      }
    }
    return {
      key: 'dayDots',
      title: 'How bright is your day?',
      sub: dayDotsSubLine(phase),
      color: deckColors.dayDots,
      headerRight: <DayDotsSkipPill phase={phase} onPress={handleDayDotSkip} />,
      fixedBody: true,
      children: (
        <HomeDayDotsCard
          phase={phase}
          dotIndex={dayDots?.dotIndex}
          trail={trail}
          cardColor={deckColors.dayDots}
          onSave={handleDayDotSave}
        />
      ),
    };
  }

  // Polaroids sent: an ordinary scrolling card (like Your Goals) with no
  // sub line, a + that opens Tickle Pics (where a Polaroid is sent from),
  // and the Polaroids two across -- or, with none on this phone, a line
  // and a Send a Polaroid row (also Tickle Pics). Empty until its first
  // read answers (the deck waits for it).
  // It wears the Blogbits colour (and row fill) in every colour set.
  function polaroidsCard() {
    const openTicklePics = () => router.navigate('/pinboard');
    let children;
    if (!sentPolaroidsLoaded) {
      children = <View />;
    } else if (sentPolaroids.length === 0) {
      children = (
        <View style={styles.polaroidsEmpty}>
          <Text style={deckRowStyles.body}>Polaroids you send from Tickle Pics show up here.</Text>
          <TouchableOpacity
            style={[deckRowStyles.row, rowFill.multickles, styles.polaroidsEmptyRow]}
            activeOpacity={0.7}
            onPress={openTicklePics}
            accessibilityRole="button"
            accessibilityLabel="Send a Polaroid. Opens Tickle Pics."
          >
            <Text style={deckRowStyles.label} numberOfLines={1}>Send a Polaroid</Text>
          </TouchableOpacity>
        </View>
      );
    } else {
      children = (
        <HomePolaroidsGrid items={sentPolaroids} accentColor={accent.card} onOpen={setViewPolaroid} />
      );
    }
    return {
      key: 'polaroids',
      title: 'Polaroids sent',
      // No colour slot of its own: the Blogbits colour in every set.
      color: deckColors.multickles,
      headerAdd: { a11yLabel: 'Send a Polaroid, opens Tickle Pics', onPress: openTicklePics },
      children,
    };
  }

  // Your trackers: an ordinary scrolling card in the My Rewards colour (no
  // slot of its own), a + that opens New tracker, and one row per tracker
  // with today's rating ("Not rated" until rated); a row opens the Your
  // trackers page. Empty: a line and an Add a tracker row.
  function trackersCard() {
    const openNew = () => router.push('/tracker-new');
    let children;
    if (trackersState === 'loading') {
      children = <View />;
    } else if (trackersState === 'error') {
      children = <Text style={deckRowStyles.body}>Couldn't load your trackers right now.</Text>;
    } else if (trackers.length === 0) {
      children = (
        <View style={styles.polaroidsEmpty}>
          <Text style={deckRowStyles.body}>Track anything you choose.</Text>
          <TouchableOpacity
            style={[deckRowStyles.row, rowFill.rewards, styles.polaroidsEmptyRow]}
            activeOpacity={0.7}
            onPress={openNew}
            accessibilityRole="button"
            accessibilityLabel="Add a tracker"
          >
            <Text style={deckRowStyles.label} numberOfLines={1}>Add a tracker</Text>
          </TouchableOpacity>
        </View>
      );
    } else {
      children = trackers.map((t) => {
        const state = ratingLabel(t, trackersToday.get(t.id) ?? null);
        return (
          <TouchableOpacity
            key={t.id}
            style={[deckRowStyles.row, rowFill.rewards]}
            activeOpacity={0.7}
            onPress={() => router.push('/trackers')}
            accessibilityRole="button"
            accessibilityLabel={`${t.name}, today ${state}. Opens Your trackers.`}
          >
            <Text style={deckRowStyles.label} numberOfLines={1}>{t.name}</Text>
            <Text style={styles.trackerState} numberOfLines={1}>{state}</Text>
          </TouchableOpacity>
        );
      });
    }
    return {
      key: 'trackers',
      title: 'Your trackers',
      // No colour slot of its own: the My Rewards colour in every set.
      color: deckColors.rewards,
      headerAdd: { a11yLabel: 'Add a tracker', onPress: openNew },
      children,
    };
  }

  // Card order: Remember this?, Your Goals, My Rewards, Blogbits,
  // Nudges & Notes, Day Dots, Polaroids sent, Your trackers -- only the
  // ones switched on in Settings (Home cards) that are showing: 0 to 8
  // cards.
  const deckCards = [
    rememberOn && showRememberCard && rememberCard(),
    goalsOn && showGoalsCard && goalsCard(),
    rewardsOn && showRedeemCard && rewardsCard(),
    multicklesOn && showFollowedTalesCard && multicklesCard(),
    rnrsOn && rnrsCard(),
    dayDotsOn && dayDotsCard(),
    polaroidsOn && polaroidsCard(),
    trackersOn && trackersCard(),
  ].filter(Boolean);
  // Every card switched off (a saved choice, not "not chosen yet"): the
  // No cards on Home box instead of the deck (only once the entries load
  // is done).
  const allCardsOff = cardsChosen && !rememberOn && !goalsOn && !rewardsOn && !multicklesOn && !rnrsOn && !dayDotsOn && !polaroidsOn && !trackersOn;
  // 322dp, or the content width when the screen is narrower (a 360dp
  // phone has 320dp between Home's side paddings).
  const deckWidth = Math.min(DECK_WIDTH, windowWidth - 2 * HOME_SIDE_PADDING, HOME_CONTENT_MAX_WIDTH);
  // Room for the deck (cards + dots and arrows row): from its measured top
  // down to the top of the tab bar, less SPARE_ROOM. The page runs under
  // the floating tab bar, whose height includes the bottom safe-area
  // inset; the top inset is in the content's top padding, so in innerTop.
  // HomeDeck clamps the cards to DECK_MIN_HEIGHT..DECK_MAX_HEIGHT, and
  // ignores this at large font scales. null until measured.
  const deckFitHeight = innerTop == null || deckTop == null
    ? null
    : (pageHeight || windowHeight) - tabBarHeight - SPARE_ROOM - (innerTop + deckTop);
  // Every card's data is in: entries (loading), Goals, the Reward List
  // while Tokens & Rewards is on, followed Multickles, and today's
  // Routines and Reminders, and the Day Dots read. A failed fetch never
  // sets its flag (except rnrLoaded, whose card shows its own error, and
  // dayDotsLoaded, whose card then shows today's dot without the trail)
  // -- the deck's own 3s wait covers that.
  // A card switched off in Settings isn't waited for.
  const deckSettled = !loading
    && (!goalsOn || goalsLoaded)
    && (!rewardsOn || !tokensEnabled || rewardsLoaded)
    && (!multicklesOn || followedTalesLoaded)
    && (!rnrsOn || rnrLoaded)
    && (!dayDotsOn || dayDotsLoaded)
    && (!polaroidsOn || sentPolaroidsLoaded)
    && (!trackersOn || trackersState !== 'loading');

  // label is the short text under each pill; a11yName is what a screen
  // reader says, so the two "Polaroid" pills can still be told apart.
  const STAT_PILLS = [
    { key: 'madeMeSmile', icon: 'happy-outline', value: `${madeMeSmileTotals.week} | ${madeMeSmileTotals.month} | ${madeMeSmileTotals.allTime}`, tooltip: "This made me smile today · week / month / all-time", label: 'Polaroid', a11yName: 'Made me smile Polaroids shared' },
    { key: 'thoughtOfYou', icon: 'heart-outline', value: `${thoughtOfYouTotals.week} | ${thoughtOfYouTotals.month} | ${thoughtOfYouTotals.allTime}`, tooltip: "I saw this and thought of you · week / month / all-time", label: 'Polaroid', a11yName: 'Thought of you Polaroids shared' },
    { key: 'ripples', icon: 'eye-outline', value: `${weekRipples} | ${monthRipples} | ${totalRipples}`, tooltip: "Ripples · week / month / all-time", label: 'Ripples', a11yName: 'Ripples' },
  ];

  // Home's New Tickle row, drawn by TesterFeedbackPill (renderRow).
  // test is null for everyone but a tester with ideas today: then the
  // row is exactly New Tickle and Quick Tickle, right-aligned, as before.
  // For a tester (TEMPORARY) it is { pill, onButtonsLayout }: pill is the
  // "Test Ideas" or "Test" pill when one fits to the left of the two
  // buttons, or null when neither does (TesterFeedbackPill then shows it
  // on its own line under the row); onButtonsLayout reports the two
  // buttons' natural width, which that fit check needs.
  function renderNewTickleRow(test) {
    const buttons = (
      <>
        <NewTickleButton home onPress={() => router.push('/create')} />
        <TouchableOpacity
          ref={quickDotRef}
          onPress={openQuickPopover}
          disabled={quickSaving}
          activeOpacity={0.8}
          hitSlop={HOME_BUTTON_HIT_SLOP}
          style={[TICKLE_BUTTON_SURFACE, styles.quickDot, QUICK_BUTTON_SHAPE]}
          accessibilityRole="button"
          accessibilityLabel="Quick Tickle: log a Vibe in one tap"
          accessibilityState={{ expanded: quickPopoverOpen, disabled: quickSaving }}
        >
          <View style={styles.quickDotDots} accessible={false} importantForAccessibility="no-hide-descendants">
            {NATURE_ORDER.map((key) => (
              <View
                key={key}
                style={{ width: QUICK_DOT_SIZE, height: QUICK_DOT_SIZE, borderRadius: QUICK_DOT_SIZE / 2, backgroundColor: vibeColors[key] }}
                accessible={false}
              />
            ))}
          </View>
        </TouchableOpacity>
        {/* Quick Quest (app/quick-quest.js): a round 30dp button in the
            Quick Tickle pill's look, 8dp after it (the row's gap less 2). */}
        <TouchableOpacity
          onPress={() => router.push('/quick-quest')}
          activeOpacity={0.8}
          hitSlop={{ ...HOME_BUTTON_HIT_SLOP, left: 7, right: 7 }}
          style={[TICKLE_BUTTON_SURFACE, styles.questDice]}
          accessibilityRole="button"
          accessibilityLabel="Quick Quest: a small thing to try"
        >
          <Ionicons name="dice-outline" size={16} color={TICKLE_BUTTON_INK} />
        </TouchableOpacity>
      </>
    );
    if (!test) {
      return <View style={[styles.newTickleRow, { gap: HOME_BUTTON_GAP }]}>{buttons}</View>;
    }
    return (
      <View style={[styles.newTickleRow, { gap: HOME_BUTTON_GAP }]}>
        {test.pill}
        <View style={[styles.newTickleButtons, { gap: HOME_BUTTON_GAP }]} onLayout={test.onButtonsLayout}>
          {buttons}
        </View>
      </View>
    );
  }

  return (
    <>
    <WallpaperBackground>
    {/* nestedScrollEnabled -- Android: without this, the outer page
        scroller does not pass the card list's nested scroll up to the
        RefreshControl, so a downward drag on a card list that has been
        scrolled is taken as pull-to-refresh. */}
    <ScrollView
      style={styles.container}
      ref={scrollRef}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.rust]} tintColor={C.rust} />
      }
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: styles.content.paddingBottom + tabBarHeight },
      ]}
    >
      <View style={styles.contentInner} onLayout={(e) => setInnerTop(e.nativeEvent.layout.y)}>
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
              color={vibeColors[key]}
              textColor={VIBE_CARD_PALETTE.text}
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

        {/* Caption above the pills, both on one shaded panel -- the
            Settings group shade (app/settings.js styles.card). */}
        <View style={styles.mojoPanel}>
        <Text style={styles.statPillsCaption}>Mojo Shared</Text>
        <View style={styles.statPillsRow}>
          {STAT_PILLS.map((pill) => (
            <TouchableOpacity
              key={pill.key}
              hitSlop={BUTTON_HIT_SLOP}
              style={[styles.statPill, { borderColor: accent.card }]}
              activeOpacity={0.7}
              onPress={() => showStatTooltip(pill.key)}
              accessibilityRole="button"
              accessibilityLabel={`${pill.a11yName}: ${pill.value.split(' | ').join(', ')} (week, month, all-time)`}
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
        <View style={styles.statPillLabelsRow}>
          {STAT_PILLS.map((pill) => (
            <Text key={pill.key} style={styles.statPillLabel} numberOfLines={1}>{pill.label}</Text>
          ))}
        </View>
        </View>

        {/* New Tickle, then Quick Tickle at the far right. Both share
            one slim pill look (components/NewTickleButton.js). The popup
            measures the visible Quick Tickle pill when it opens, so it
            stays anchored above it. For testers (TEMPORARY), the Test
            Ideas (or Test) pill sits to their left; the row is drawn by
            TesterFeedbackPill so its panel can open under the whole row. */}
        <TesterFeedbackPill scrollRef={scrollRef} renderRow={renderNewTickleRow} />

        {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

        {!loading && !loadError && entries.length === 0 && !profile?.quick_start_dismissed && (
          <QuickStartCard onDismiss={handleDismissQuickStart} style={styles.quickStartTopGap} />
        )}

        {!loading && entries.length === 0 && loadError && (
          <Text style={styles.emptyText}>Couldn't load your Tickles — please try again later.</Text>
        )}

        {/* Not chosen yet: the Pick your cards card, the deck's size, in
            its place (measured the same way, for the same height). */}
        {!cardsChosen && (
          <View style={styles.bottomCards} onLayout={(e) => setDeckTop(e.nativeEvent.layout.y)}>
            <PickCardsGhost width={deckWidth} fitHeight={deckFitHeight} onPick={() => setPickSheetOpen(true)} />
          </View>
        )}

        {/* Mounted from the start (not after loading), so the deck holds
            its space while it waits for deckSettled. */}
        {cardsChosen && deckCards.length > 0 && (
          <View style={styles.bottomCards} onLayout={(e) => setDeckTop(e.nativeEvent.layout.y)}>
            <HomeDeck cards={deckCards} width={deckWidth} dataSettled={deckSettled} fitHeight={deckFitHeight} />
          </View>
        )}

        {!loading && allCardsOff && (
          <View style={styles.bottomCards}>
            <NoCardsBox width={deckWidth} onPick={() => setPickSheetOpen(true)} />
          </View>
        )}

        {!loading && entries.length > 0 && !profile?.quick_start_dismissed && (
          <QuickStartCard onDismiss={handleDismissQuickStart} />
        )}
      </View>
    </ScrollView>
    <QuickTickleToast
      toast={quickToast}
      onUndo={handleQuickUndo}
      onTickleIt={handleQuickTickleIt}
      onTimeout={handleQuickToastTimeout}
      style={[styles.quickToast, { bottom: tabBarHeight + 12 }]}
    />
    <RnrsPopup visible={rnrsPopupOpen} onClose={closeRnrsPopup} />
    <PickCardsSheet visible={pickSheetOpen} onClose={() => setPickSheetOpen(false)} />
    <PolaroidViewModal item={viewPolaroid} accentColor={accent.card} onClose={() => setViewPolaroid(null)} />
    </WallpaperBackground>

    {/* Nailed it!: active Goals that earn tokens; a tap gives +1 token
        (no Tickle). My Rewards re-reads its balance after each one. */}
    <NailedItPopup
      visible={nailedOpen}
      goals={activeGoals.filter((g) => g.earns_tokens)}
      userId={session?.user?.id}
      bottomOffset={tabBarHeight}
      onClose={() => setNailedOpen(false)}
      onOpenGoals={() => {
        setNailedOpen(false);
        router.push('/goals');
      }}
      onTokenAwarded={() => {
        loadRewards();
        loadGoalWeekLogs();
      }}
    />

    {/* Find a Blogbit: Blogbits the user could follow; a pick opens that
        Blogbit's page, where it can be followed. */}
    <FindBlogbitsPopup
      visible={findBlogbitsOpen}
      userId={session?.user?.id}
      bottomOffset={tabBarHeight}
      onClose={() => setFindBlogbitsOpen(false)}
      onPick={(taleId) => {
        setFindBlogbitsOpen(false);
        router.push({ pathname: '/tale', params: { id: taleId } });
      }}
    />

    {/* Quick Tickle's Vibe popover, anchored to the dot. */}
    <QuickTicklePopover
      visible={quickPopoverOpen}
      anchor={quickAnchor}
      onPick={handleQuickTickle}
      onClose={() => setQuickPopoverOpen(false)}
      saving={quickSaving}
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
  content: { padding: HOME_SIDE_PADDING, paddingBottom: CONTENT_BOTTOM_EXTRA, alignItems: 'center' },
  contentInner: { width: '100%', maxWidth: HOME_CONTENT_MAX_WIDTH },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: TITLE_ROW_GAP,
  },
  // Cancels CornerNav's own marginBottom (meant for when it stands alone
  // at the top of Tickle Stash/Calendar/Tickle Pics) now that it's nested inside
  // titleRow -- titleRow's own marginBottom above already provides the
  // gap to profileRow below; without this the row would carry a double
  // margin and an uneven height between the title text and the icons.
  cornerNavInline: { marginBottom: 0 },
  title: { fontSize: 20, fontWeight: 'bold', color: C.rustDark, flexShrink: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: PROFILE_ROW_GAP },
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

  vibeCardsRow: { flexDirection: 'row', gap: 12, marginBottom: VIBE_CARDS_GAP },
  vibeLabelsRow: { flexDirection: 'row', gap: 12, marginBottom: VIBE_LABELS_GAP },
  vibeLabel: {
    flex: 1, fontSize: 12, fontWeight: '600', color: C.subtext, textAlign: 'center',
  },

  // Same fill and border as Settings' group cards (app/settings.js
  // styles.card: C.subtext at 10% over the wallpaper, C.border); radius
  // 20 as asked (Settings' own cards use 16).
  mojoPanel: {
    backgroundColor: withAlpha(C.subtext, 0.1), borderWidth: 1, borderColor: C.border,
    borderRadius: 20, paddingTop: MOJO_PADDING_V, paddingBottom: MOJO_PADDING_V, paddingHorizontal: 12,
    marginBottom: MOJO_PANEL_GAP,
  },
  statPillsRow: { flexDirection: 'row', gap: 10, marginBottom: MOJO_PILLS_GAP },
  statPillLabelsRow: { flexDirection: 'row', gap: 10 },
  statPillLabel: {
    flex: 1, fontSize: 11, fontWeight: '600', color: C.subtext, textAlign: 'center',
  },
  statPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: C.card, borderWidth: 1.2,
    // Large enough to always exceed half the box's actual height --
    // RN clamps borderRadius to min(radius, height/2), so this reads as
    // a genuine pill regardless of exact content-driven height, without
    // having to hardcode that height ourselves.
    borderRadius: 999,
    // The app-wide pill height (lib/buttonSize.js), 44dp to tap.
    minHeight: BUTTON_HEIGHT,
  },
  statPillNumber: { fontSize: 13, fontWeight: '700', color: C.text },
  statPillsCaption: {
    fontSize: MOJO_CAPTION_FONT_SIZE, fontWeight: '600', color: MOJO_CAPTION_COLOR,
    textAlign: 'center', marginBottom: MOJO_CAPTION_GAP,
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

  // Right-aligned; gap set inline (HOME_BUTTON_GAP). Drawn above the deck
  // (zIndex, plus elevation for Android), so a tilted card behind the
  // front one never covers a button or takes its taps.
  newTickleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    zIndex: 10, elevation: 10,
  },
  // New Tickle and Quick Tickle as one natural-width group, for the
  // tester row only (renderNewTickleRow) -- measured for the Test Ideas
  // fit check, never squeezed.
  newTickleButtons: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  // Fill, border and shadow come from TICKLE_BUTTON_SURFACE; size from
  // QUICK_BUTTON_SHAPE.
  quickDot: { alignItems: 'center', justifyContent: 'center' },
  quickDotDots: { flexDirection: 'row', gap: 4 },
  questDice: {
    width: 30, height: 30, borderRadius: 15, marginLeft: 8 - HOME_BUTTON_GAP,
    alignItems: 'center', justifyContent: 'center',
  },
  // Floats above the tab bar (bottom set inline), within Home's side
  // padding.
  quickToast: { position: 'absolute', left: HOME_SIDE_PADDING, right: HOME_SIDE_PADDING },

  loader: { marginTop: 12 },
  quickStartTopGap: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 12 },

  // DECK_GAP below the buttons (or the tester pill, when it shows).
  bottomCards: { marginTop: DECK_GAP },
  // Polaroids sent card's empty state: the line, then its one row.
  polaroidsEmpty: { gap: 12 },
  polaroidsEmptyRow: { alignSelf: 'flex-start' },
  // Your trackers card: today's rating at the right of a row.
  trackerState: { marginLeft: 'auto', flexShrink: 0, maxWidth: '45%', fontSize: 13, color: DECK_SUBTEXT },

  // Multickles card's Follow / Mine chips. Selected: solid cream with the
  // card's own colour as text; not selected: the rows' cream outline.
  multicklesSwitch: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: MULTICKLES_CHIP_GAP },
  multicklesChip: {
    minHeight: MULTICKLES_CHIP_HEIGHT, borderRadius: MULTICKLES_CHIP_HEIGHT / 2,
    paddingHorizontal: MULTICKLES_CHIP_PADDING, justifyContent: 'center', borderWidth: 1,
  },
  multicklesChipSelected: { backgroundColor: MULTICKLES_CHIP_SELECTED_FILL, borderColor: MULTICKLES_CHIP_SELECTED_FILL },
  multicklesChipIdle: { backgroundColor: 'transparent', borderColor: MULTICKLES_CHIP_OUTLINE },
  multicklesChipText: { fontSize: MULTICKLES_CHIP_FONT_SIZE, fontWeight: '600', color: MULTICKLES_CHIP_TEXT },
  // The + after Follow / Mine: the chips' height as a circle, same as the
  // + in the other cards' header corners (HomeDeck's HEADER_ADD_SIZE).
  multicklesAdd: {
    flexShrink: 0, width: HEADER_ADD_SIZE, minHeight: HEADER_ADD_SIZE, height: HEADER_ADD_SIZE,
    borderRadius: HEADER_ADD_SIZE / 2, paddingHorizontal: 0, alignItems: 'center',
  },

  // Routines and Reminders card: one block per slot (heading + rows, 8dp
  // apart, like the list's own gap). Heading in the pop-up's slot-label
  // type (13/700). Skipped rows: no fill, dashed outline, faded label.
  rnrSlot: { gap: 8 },
  rnrSlotLabel: { fontSize: 13, fontWeight: '700', color: DECK_SUBTEXT },
  // Filled inline with the card's own colour (from the chosen set), solid
  // (not transparent), so it still reads as "no fill" but hides the corner
  // circle like the other rows.
  rnrRowSkipped: { borderStyle: 'dashed' },
  rnrLabelSkipped: { color: DECK_SUBTEXT },
  rnrState: { flexShrink: 0, fontSize: 13, fontWeight: '700', color: DECK_SUBTEXT },

  // Goal rows: the Goal's own colour as a small dot with a faint cream
  // ring, so the darker Goal colours still read on the card.
  goalColorDot: {
    flexShrink: 0, width: 12, height: 12, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(255,248,236,0.6)',
  },
  // Same ring as components/GoalTargetCircle.js at 22dp, in cream on the
  // deck card; fixed width since it never holds a number.
  rewardCircle: {
    flexShrink: 0, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: DECK_TEXT,
  },
  rewardCircleFilled: { backgroundColor: DECK_TEXT },

  // Photo-only Remember this? entries: a small thumbnail in place of
  // text.
  rememberThumb: { width: 22, height: 22, borderRadius: 5.5, backgroundColor: C.border },
  rememberThumbMissing: { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
});
