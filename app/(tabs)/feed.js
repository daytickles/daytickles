import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor, darken, lighten, textOn } from '../../lib/theme';
import { shareEntry, shareStatus, sharePhotoOnlyEntry, SHARE_CAPTIONS } from '../../lib/sharing';
import { notifyLikeReceived } from '../../lib/likeNotify';
import { localDateString } from '../../lib/week';
import { EVENING_HOUR, EVENING_MINUTE } from '../../lib/reminders';
import GoalTagModal from '../../components/GoalTagModal';
import AwardPickerModal from '../../components/AwardPickerModal';
import ShareModal from '../../components/ShareModal';
import PhotoEnlargeModal from '../../components/PhotoEnlargeModal';
import EntryCard, { CARD_SPACING } from '../../components/EntryCard';
import DayDotsCard from '../../components/DayDotsCard';
import CornerNav from '../../components/CornerNav';
import CountBadge from '../../components/CountBadge';
import WallpaperBackground from '../../components/WallpaperBackground';
import { File } from 'expo-file-system';
import {
  initPinBoardDb, getAllLinkedEntryIds, getPhotoForEntry, getPhotosForEntries, relinkPhotoToEntry,
} from '../../lib/pinBoardDb';
import { pickFromLibrary } from '../../lib/pinBoardPhotos';
import { useShareCard } from '../../lib/useShareCard';
import { getLastOpened, setLastOpened } from '../../lib/feedLastOpened';
import { makePhotoTicklePublic, makePhotoTicklePrivate, deletePhotoTickleMedia } from '../../lib/photoTickleStorage';

const TABS = [
  { id: 'mine', label: 'Mine' },
  { id: 'favorites', label: "Fav's" },
  { id: 'following', label: 'Following' },
  { id: 'rippled', label: 'Rippled' },
];

// Mine-only. 'all' is the default: everything, tagged or not, EXCEPT
// My Day (day_journal) entries -- those only ever surface via their own
// dedicated chip below, so they don't clutter the all-Vibes view (see
// loadFeed's own entriesData filter below). Unrelated to My Day's own
// privacy status -- a Rippled My Day entry is just as public as any
// other Rippled Tickle, it's simply kept out of this particular chip.
const NATURE_FILTERS = [
  { id: 'received', label: 'Smiles' },
  { id: 'given', label: 'Given' },
  { id: 'self', label: 'For me' },
];

// My Day is a permanent chip now, same as the three Vibe filters above
// -- id stays 'day_journal' (matches tickle_entries.tickle_nature),
// only the user-facing label reads "My Day".
const DAY_JOURNAL_FILTER = { id: 'day_journal', label: 'My Day' };

const EMPTY_TEXT = {
  mine: "You haven't shared any tickles to the feed yet.",
  favorites: 'Tap the star on a tickle to save it here.',
  following: 'Follow people to see their tickles here.',
  rippled: 'No public tickles yet.',
};

// Mine's My Day filter needs its own empty message rather than the
// generic `mine` one above -- that message talks about sharing to the
// feed, which is wrong here since My Day entries are private by design
// and Mine shows entries regardless of sharing status anyway.
function getEmptyText(tab, natureFilter, goalFilter) {
  if (tab === 'mine' && natureFilter === 'day_journal' && !goalFilter) {
    return 'Write your first My Day entry to see it here.';
  }
  return EMPTY_TEXT[tab];
}

const ENTRY_SELECT =
  'id, entry_date, text_content, like_count, tickle_nature, goal_id, visibility, is_edited, created_at, user_id, entry_kind, local_photo_filename, media_url, profiles!tickle_entries_user_id_fkey(username, avatar_emoji, accent_theme, country, founding_member_number)';

// Mine shows entries fully untruncated (deliberate — people should be
// able to read the complete text), so real cards range from one line to
// fifteen-plus. A single fixed height can't represent that, so
// getItemLayout below sums each card's *actual measured* height
// (recorded via onLayout into cardHeights, keyed by entry id) instead of
// assuming a uniform size. DEFAULT_ITEM_HEIGHT is only the fallback used
// for cards that haven't rendered/measured yet — matches entryCard's
// typical single-line size (102.33px measured + CARD_SPACING, imported
// from EntryCard.js so the two can't silently drift apart).
const DEFAULT_ITEM_HEIGHT = 114;

// Public award flag (entry_id only, see migration 0021) for a given
// page of entries. Called from inside loadFeed itself, right alongside
// setEntries, rather than as a separate effect reacting to `entries` --
// that shape used to fire a second render right after every content
// refresh (setEntries, then the effect noticing entries changed,
// querying, then setAwardedPublicTypes); calling it here lets both land
// in the same batch instead.
//
// Map<entryId, string[]> -- distinct award types (from ANY giver) each
// entry has actually received (see migration 0054's awarded_entries
// view: public, but never reveals who gave it, only which type(s)).
async function fetchAwardedEntryTypes(entryIds) {
  if (entryIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('awarded_entries')
    .select('entry_id, award_type')
    .in('entry_id', entryIds);
  if (error) return new Map();
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.entry_id)) map.set(row.entry_id, []);
    map.get(row.entry_id).push(row.award_type);
  }
  return map;
}

// Resolves the actual displayable image for every currently-loaded
// entry that has one -- local file if this device has (and still has)
// the link (lib/pinBoardDb.js's getPhotosForEntries), falling back to
// the entry's own media_url for a device/viewer with no local link (a
// non-owner viewing a public entry, or the owner's own second device).
// The upload-on-make-public mechanic (lib/photoTickleStorage.js) now
// covers entry_kind='text' entries with a Tickle-a-Photo link the same
// way it already covered photo_only, so this fallback is exercised by
// both kinds identically -- no entry_kind check here at all, just
// media_url. Neither case covers "the file's genuinely missing" --
// callers just get back a falsy uri for that entry, which EntryCard
// already renders as its Relink/"not available" placeholder
// (photo_only) or its fallback camera icon (linked text entry).
async function resolveLinkedPhotoUris(userId, entries) {
  if (!entries.length) return new Map();

  const localPhotos = await getPhotosForEntries(userId, entries.map((e) => e.id));
  const map = new Map();
  for (const entry of entries) {
    const local = localPhotos.get(entry.id);
    // A cheap stat, not a full read -- fine to run once per feed load
    // rather than per render (the spec flags per-render existence
    // checking as a real perf concern; this isn't that).
    if (local && new File(local.file_path).exists) {
      map.set(entry.id, local.file_path);
    } else if (entry.media_url) {
      map.set(entry.id, entry.media_url);
    }
  }
  return map;
}

// The two tabs "new since you were here" tracks -- see
// lib/feedLastOpened.js. A plain array rather than deriving from TABS
// since 'mine'/'favorites' are deliberately excluded.
const NEW_SINCE_TABS = ['following', 'rippled'];

// Cheap head-count query (no rows fetched), mirroring loadFeed's own
// following/rippled predicates exactly so the count matches what the tab
// would actually show. `since === null` (tab never opened on this device)
// is handled by callers, not here -- they simply don't call this in that
// case, per the "no badge on first visit" design decision.
async function countNewSince(tabId, since, followeeIds) {
  let query = supabase
    .from('tickle_entries')
    .select('id', { count: 'exact', head: true })
    .eq('visibility', 'public')
    .gt('created_at', new Date(since).toISOString());
  if (tabId === 'following') {
    if (followeeIds.length === 0) return 0;
    query = query.in('user_id', followeeIds);
  }
  const { count, error } = await query;
  return error ? 0 : (count || 0);
}

function dividerLabel(tabId, count) {
  const noun = tabId === 'rippled' ? 'ripple' : 'post';
  return `${count} new ${noun}${count === 1 ? '' : 's'}`;
}

export default function Feed() {
  const { session, profile, refreshProfile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const accentDarkText = textOn(accentDark);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const initialTab = TABS.some((t) => t.id === params.tab) ? params.tab : 'mine';
  const [tab, setTab] = useState(initialTab);
  const [natureFilter, setNatureFilter] = useState('all');
  // Mine-only, mutually exclusive with natureFilter rather than merged
  // into it -- a goal_id filter mixes every nature together (including
  // My Day), which a single shared enum couldn't express alongside
  // natureFilter's own 'all'/'received'/'given'/'self'/'day_journal'
  // values without overloading what each one means. null = no Goal
  // filter active. Picking a Goal chip doesn't touch natureFilter's own
  // value (so it's remembered if the Goal filter is later cleared) --
  // the nature row's selected-chip highlight instead checks
  // `!goalFilter` too, so nothing in that row LOOKS selected while a
  // Goal filter is active.
  const [goalFilter, setGoalFilter] = useState(null);
  // Day Dots state for today, re-derived on every focus of this screen
  // (see the effect below) -- null until the first check resolves.
  // Deliberately no live timer: a screen sitting continuously open
  // across the 8pm cutoff just stays on 'before' until the next focus
  // (tab switch, app resume), which is an accepted simplification, not
  // a bug -- see project memory on the discarded open/close-timer design
  // this replaces. { phase: 'before'|'active'|'answered'|'skipped',
  // dotIndex? } -- dotIndex only set when phase === 'answered'.
  const [dayDots, setDayDots] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [pickerEntryId, setPickerEntryId] = useState(null);
  const [shareEntryId, setShareEntryId] = useState(null);
  const [awardEntryId, setAwardEntryId] = useState(null);
  const [followedIds, setFollowedIds] = useState(new Set());
  const [favoritedIds, setFavoritedIds] = useState(new Set());
  const [likedIds, setLikedIds] = useState(new Set());
  const [photoLinkedIds, setPhotoLinkedIds] = useState(new Set());
  // Map<entryId, uri> -- resolved display image for every currently-
  // loaded photo-only entry, see resolveLinkedPhotoUris below. Loaded
  // alongside setEntries in loadFeed (same shape as awardedPublicTypes),
  // not folded into loadPhotoLinks above -- that Set only ever needs
  // membership (badge on/off) for a *pinned-to* photo, this needs the
  // actual resolved uri for an entry's *own* photo, a different job.
  const [linkedPhotoUris, setLinkedPhotoUris] = useState(new Map());
  // Map<entryId, awardType> -- only this viewer's own awards (awards
  // RLS is private to the giver, same shape as favoritedIds), and a Map
  // rather than a Set since the icon needs to know *which* award, not
  // just whether one exists.
  const [awardedTypes, setAwardedTypes] = useState(new Map());
  // Map<entryId, string[]> -- the PUBLIC award types, from anyone (via
  // awarded_entries, now entry_id + award_type -- see migration 0054),
  // unlike awardedTypes above which is private/viewer-scoped. Loaded
  // inside loadFeed itself, alongside setEntries (see
  // fetchAwardedEntryTypes above), not per-session like the other Sets,
  // since it needs to cover every entry on screen, not just ones this
  // viewer has personally interacted with.
  const [awardedPublicTypes, setAwardedPublicTypes] = useState(new Map());
  // "New since you were here" -- see lib/feedLastOpened.js. badgeCounts
  // holds what each tab's pill should show right now (null = no badge,
  // covering both "never opened on this device" and "opened moments ago,
  // nothing new yet"). dividerThresholds holds the timestamp *as of the
  // moment the tab was last opened*, captured once per open and held
  // steady across refetches while the tab stays open -- it's what the
  // in-feed "N new posts" divider is computed against, deliberately
  // separate from badgeCounts (which is allowed to change while viewing).
  const [badgeCounts, setBadgeCounts] = useState({ following: null, rippled: null });
  const [dividerThresholds, setDividerThresholds] = useState({ following: null, rippled: null });
  const [enlargeUri, setEnlargeUri] = useState(null);
  const { hiddenCard, captureCard } = useShareCard();
  const [highlightedEntryId, setHighlightedEntryId] = useState(
    Array.isArray(params.highlightEntry) ? params.highlightEntry[0] : params.highlightEntry || null
  );
  const listRef = useRef(null);
  // Real per-item space (rendered height + CARD_SPACING), keyed by entry
  // id, filled in as each card's onLayout fires. A plain object in a ref
  // rather than state — getItemLayout reads it synchronously and mutating
  // it shouldn't itself trigger a re-render.
  const cardHeights = useRef({});

  // Tickle Stash used to be a plain stack screen that unmounted/remounted on
  // every visit, so the useState initializers above were enough to pick
  // up a fresh tab/highlightEntry each time. Now that Tickle Stash lives in the
  // bottom Tabs navigator it stays mounted across tab switches, so a
  // repeat router.push('/feed', { tab, highlightEntry }) from Home,
  // Weekly Summary, or notifications.js just refocuses this same
  // instance instead of remounting it -- without this resync, those
  // pushes silently stop switching tabs/highlighting after the first
  // time Tickle Stash is opened in a session.
  useEffect(() => {
    if (!TABS.some((t) => t.id === params.tab)) return;
    setTab(params.tab);
    setHighlightedEntryId(
      Array.isArray(params.highlightEntry) ? params.highlightEntry[0] : params.highlightEntry || null
    );
  }, [params.tab, params.highlightEntry]);

  // followedIds/likedIds are only ever mutated by this screen's own
  // optimistic toggle handlers below (handleToggleFollow/handleToggleLike)
  // -- no other screen writes to follows/likes -- so they only need to
  // load once per session rather than refetch on every tab focus.
  // favoritedIds and goals, by contrast, can genuinely change from other
  // screens while Tickle Stash is backgrounded (Calendar's favorite toggle, the
  // Goals screen), so those two keep reloading on every focus below.
  const loadFollowed = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', session.user.id);
    if (!error) setFollowedIds(new Set((data || []).map((f) => f.followee_id)));
  }, [session]);

  const loadFavorited = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('favorites')
      .select('entry_id')
      .eq('user_id', session.user.id);
    if (!error) setFavoritedIds(new Set((data || []).map((f) => f.entry_id)));
  }, [session]);

  const loadLiked = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('likes')
      .select('entry_id')
      .eq('user_id', session.user.id);
    if (!error) setLikedIds(new Set((data || []).map((l) => l.entry_id)));
  }, [session]);

  // Mine-only feature (goal-tagging your own entries), but loaded
  // unconditionally like the sets above — cheap, and avoids a load-on-
  // tab-switch delay the first time someone taps into Mine.
  const loadGoals = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) setGoals(data || []);
  }, [session]);

  useEffect(() => {
    loadFollowed();
  }, [loadFollowed]);

  useFocusEffect(
    useCallback(() => {
      loadFavorited();
    }, [loadFavorited])
  );

  useEffect(() => {
    loadLiked();
  }, [loadLiked]);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  // Local-only Pin Board links (see lib/pinBoardDb.js) — loaded the same
  // way as followedIds/favoritedIds/likedIds above: independent of tab,
  // since a link only ever exists for this device's own entries no
  // matter which tab surfaces them. initPinBoardDb() first, same as
  // Calendar's loadPinBoardData and Pinboard's loadBoard -- Tickle Stash can be
  // the very first screen a fresh install ever visits (it's a bottom
  // tab now), so it can't assume Calendar/Tickle Pics already created
  // the local SQLite tables.
  const loadPhotoLinks = useCallback(async () => {
    if (!session) return;
    await initPinBoardDb(session.user.id);
    const ids = await getAllLinkedEntryIds(session.user.id);
    setPhotoLinkedIds(new Set(ids));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadPhotoLinks();
    }, [loadPhotoLinks])
  );

  // Day Dots -- deliberately simple, no timer. Re-checked on every focus
  // of this screen (tab switch, app resume): read today's row if one
  // exists, otherwise derive 'before'/'active' from a plain local-clock
  // comparison against EVENING_HOUR/EVENING_MINUTE (shared with the
  // evening reminder's own schedule, see lib/reminders.js). No longer
  // gated on profile.daily_reminder -- this is a permanent card on My
  // Day now, not something that only matters while a notification is
  // scheduled.
  const checkDayDots = useCallback(async () => {
    if (!session) {
      setDayDots(null);
      return;
    }
    const today = localDateString(0);
    const { data } = await supabase
      .from('day_dots')
      .select('status, dot_index')
      .eq('user_id', session.user.id)
      .eq('prompt_date', today)
      .maybeSingle();

    if (data) {
      setDayDots(
        data.status === 'answered'
          ? { phase: 'answered', dotIndex: data.dot_index }
          : { phase: 'skipped' }
      );
      return;
    }

    const now = new Date();
    const isEvening =
      now.getHours() > EVENING_HOUR ||
      (now.getHours() === EVENING_HOUR && now.getMinutes() >= EVENING_MINUTE);
    setDayDots({ phase: isEvening ? 'active' : 'before' });
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      checkDayDots();
    }, [checkDayDots])
  );

  async function handleDayDotsSelect(dotIndex) {
    const today = localDateString(0);
    setDayDots({ phase: 'answered', dotIndex });
    await supabase
      .from('day_dots')
      .insert({ user_id: session.user.id, prompt_date: today, status: 'answered', dot_index: dotIndex });
  }

  async function handleDayDotsSkip() {
    const today = localDateString(0);
    setDayDots({ phase: 'skipped' });
    await supabase
      .from('day_dots')
      .insert({ user_id: session.user.id, prompt_date: today, status: 'skipped' });
  }

  // Same reasoning as loadFollowed/loadLiked above -- only this screen's
  // own handleGiveAward can ever create an award row (awards RLS is
  // private to the giver, and no other screen gives them), so this
  // loads once per session rather than refetching on every focus.
  const loadAwards = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('awards')
      .select('entry_id, award_type')
      .eq('user_id', session.user.id);
    if (!error) setAwardedTypes(new Map((data || []).map((a) => [a.entry_id, a.award_type])));
  }, [session]);

  useEffect(() => {
    loadAwards();
  }, [loadAwards]);

  // fallbackUri is only ever passed by a photo-only Polaroid's own tap
  // (its already-resolved linkedPhotoUris value) -- the local-only lookup
  // above can never find a link for a non-owner's entry on this device,
  // so without it, tapping to enlarge a stranger's photo-only Tickle
  // would silently do nothing once media_url-sourced photos exist.
  // Every other caller (the hasLinkedPhoto icon on a normal entry) omits
  // this param and keeps the original local-only behavior exactly.
  async function handleOpenPhoto(entryId, fallbackUri) {
    const photo = await getPhotoForEntry(session.user.id, entryId);
    if (photo) setEnlargeUri(photo.file_path);
    else if (fallbackUri) setEnlargeUri(fallbackUri);
  }

  // Relink -- only ever reachable from EntryCard's own placeholder,
  // which only renders it for the entry's owner (see EntryCard.js), so
  // this never runs against someone else's entry. Opens the device
  // photo picker directly (no camera option, unlike Pin Board's Add
  // Photo sheet) -- matches the spec's "opening the device's photo
  // picker" wording exactly. lib/pinBoardDb's relinkPhotoToEntry handles
  // dropping the old (missing-file) link and creating the new one.
  async function handleRelinkPhoto(entry) {
    const picked = await pickFromLibrary(session.user.id);
    if (picked.canceled) return;
    if (picked.error) {
      Alert.alert('Could not relink that photo', picked.error);
      return;
    }

    const existing = await getPhotosForEntries(session.user.id, [entry.id]);
    const oldPhotoId = existing.get(entry.id)?.id ?? null;
    await relinkPhotoToEntry(session.user.id, oldPhotoId, entry.id, picked.uri);
    setLinkedPhotoUris((prev) => new Map(prev).set(entry.id, picked.uri));
  }

  // Mirrors `entries.length > 0` for loadFeed without making `entries`
  // one of its dependencies -- react-navigation's useFocusEffect re-runs
  // its effect (and so re-invokes loadFeed immediately, screen already
  // focused) whenever the wrapped callback's identity changes, so a
  // loadFeed that depended on entries would retrigger itself every time
  // it finished loading, in a loop.
  const hasEntriesRef = useRef(false);
  useEffect(() => {
    hasEntriesRef.current = entries.length > 0;
  }, [entries]);

  // Tracks which tab/natureFilter combination the currently-shown
  // entries belong to, so loadFeed can tell a genuine tab/filter switch
  // (new content incoming, worth a brief spinner) apart from a same-tab
  // refocus or a followedIds/favoritedIds/likedIds-driven refetch (same
  // content, just refreshing in place -- no spinner flash needed).
  const lastLoadedKeyRef = useRef(null);

  const loadFeed = useCallback(async () => {
    if (!session) return;
    const loadKey = `${tab}:${natureFilter}:${goalFilter}`;
    const isTabChange = loadKey !== lastLoadedKeyRef.current;
    lastLoadedKeyRef.current = loadKey;
    // Show the spinner for a genuine tab/filter switch, or when there's
    // nothing on screen yet -- skip it for a same-tab refocus where the
    // list is just refreshing in place.
    if (isTabChange || !hasEntriesRef.current) setLoading(true);

    if (tab === 'following') {
      // Followed accounts' public entries only — RLS blocks their private
      // ones regardless, following someone doesn't grant extra visibility.
      const followeeIds = Array.from(followedIds);
      if (followeeIds.length === 0) {
        setEntries([]);
        setAwardedPublicTypes(new Map());
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('tickle_entries')
        .select(ENTRY_SELECT)
        .eq('visibility', 'public')
        .in('user_id', followeeIds)
        .order('created_at', { ascending: false });
      if (!error) {
        const entriesData = data || [];
        const awardedTypesById = await fetchAwardedEntryTypes(entriesData.map((e) => e.id));
        setEntries(entriesData);
        setAwardedPublicTypes(awardedTypesById);
        setLinkedPhotoUris(await resolveLinkedPhotoUris(session.user.id, entriesData));
      }
      setLoading(false);
      return;
    }

    if (tab === 'favorites') {
      // No visibility filter here on purpose: RLS already resolves to
      // exactly the right set (public, or your own regardless of
      // visibility) — adding one would incorrectly hide your own
      // favorited private entries.
      const favIds = Array.from(favoritedIds);
      if (favIds.length === 0) {
        setEntries([]);
        setAwardedPublicTypes(new Map());
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('tickle_entries')
        .select(ENTRY_SELECT)
        .in('id', favIds)
        .order('created_at', { ascending: false });
      if (!error) {
        const entriesData = data || [];
        const awardedTypesById = await fetchAwardedEntryTypes(entriesData.map((e) => e.id));
        setEntries(entriesData);
        setAwardedPublicTypes(awardedTypesById);
        setLinkedPhotoUris(await resolveLinkedPhotoUris(session.user.id, entriesData));
      }
      setLoading(false);
      return;
    }

    let query = supabase.from('tickle_entries').select(ENTRY_SELECT).order('created_at', { ascending: false });

    if (tab === 'mine') {
      // Mine shows all of the signed-in user's own entries, private and
      // public alike — Home truncates each entry to one line, so Mine
      // (reached by tapping an entry on Home) is where you read your
      // own entries in full regardless of sharing status.
      query = query.eq('user_id', session.user.id);
      // A Goal filter overrides the nature filter entirely rather than
      // combining with it -- every nature (including My Day) mixed
      // together for that one goal, per the Goal chips spec. natureFilter
      // itself is left untouched in state either way, so whichever nature
      // chip was last picked is still there once the Goal filter clears.
      if (goalFilter) {
        query = query.eq('goal_id', goalFilter);
      } else if (natureFilter !== 'all') {
        query = query.eq('tickle_nature', natureFilter);
      }
    } else {
      query = query.eq('visibility', 'public');
    }

    const { data, error } = await query;
    if (!error) {
      // "All" means "everything, tagged or not" (see NATURE_FILTERS'
      // own comment), but never My Day -- that stays reachable only
      // through its own dedicated chip. Plain JS !== rather than a
      // query-level .neq('tickle_nature', 'day_journal') deliberately:
      // tickle_nature can be null for untagged entries, and Postgres's
      // <> excludes NULLs under three-valued logic, which would have
      // silently dropped every untagged entry from "All" too (same
      // pitfall already hit once in weekly-summary.js's Most Liked fix).
      let entriesData = data || [];
      if (tab === 'mine' && natureFilter === 'all' && !goalFilter) {
        entriesData = entriesData.filter((e) => e.tickle_nature !== 'day_journal');
      }
      const awardedTypesById = await fetchAwardedEntryTypes(entriesData.map((e) => e.id));
      setEntries(entriesData);
      setAwardedPublicTypes(awardedTypesById);
      setLinkedPhotoUris(await resolveLinkedPhotoUris(session.user.id, entriesData));
    }
    setLoading(false);
    // likedIds isn't used to filter any query above — it's a dependency
    // purely so a like/unlike triggers this refetch, pulling like_count
    // fresh from the DB rather than ever computing it locally.
  }, [session, tab, natureFilter, goalFilter, followedIds, favoritedIds, likedIds]);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  // "New since you were here" for Following/Rippled -- see
  // lib/feedLastOpened.js for why this is AsyncStorage, not a profiles
  // column. Runs as one sequential async pass rather than two independent
  // effects: if `tab` is following/rippled, it *first* fully finishes
  // resetting that tab's own lastOpened (read the old value for the
  // divider threshold, write now(), zero its own badge) before it ever
  // looks at the other tab's badge -- so a slower in-flight query for the
  // other tab can never race with, and stomp, the tab just opened.
  // Wired to useFocusEffect (like loadFeed above, same file) rather than a
  // plain useEffect specifically so it re-runs both on a genuine return to
  // this screen (catches content that arrived while away) and on every
  // in-page tab switch (its callback depends on `tab`) -- matching the
  // design's "resets the moment the tab is opened", not just on screen
  // focus.
  const refreshNewSinceIndicators = useCallback(async () => {
    if (!session) return;
    const userId = session.user.id;

    if (tab === 'following' || tab === 'rippled') {
      const previous = await getLastOpened(tab, userId);
      await setLastOpened(tab, userId, Date.now());
      setDividerThresholds((prev) => ({ ...prev, [tab]: previous }));
      setBadgeCounts((prev) => ({ ...prev, [tab]: null }));
    }

    const otherTabs = NEW_SINCE_TABS.filter((t) => t !== tab);
    for (const t of otherTabs) {
      const since = await getLastOpened(t, userId);
      // null == never opened on this device -- no badge, per the
      // deliberate "no badge on first visit" decision (a from-account-
      // creation count would be an intimidating, meaningless first
      // impression rather than a useful one).
      const count = since == null ? null : await countNewSince(t, since, Array.from(followedIds));
      setBadgeCounts((prev) => ({ ...prev, [t]: count }));
    }
  }, [session, tab, followedIds]);

  useFocusEffect(
    useCallback(() => {
      refreshNewSinceIndicators();
    }, [refreshNewSinceIndicators])
  );

  useEffect(() => {
    if (tab !== 'mine' || !highlightedEntryId) return;
    const index = entries.findIndex((e) => e.id === highlightedEntryId);
    if (index === -1) return;

    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }, [tab, highlightedEntryId, entries]);

  // Scroll back to the top on every tab switch (Mine/Fav's/Following/
  // Rippled), Mine's nature-filter chip switch (All/Smiles/
  // Given/Boost/Journal), or Mine's Goal-filter chip switch, so a newly-
  // selected tab or filter doesn't inherit whatever scroll position the
  // previous one was left at. Skipped when a highlightEntry deep link
  // just set the tab -- that case scrolls to the specific highlighted
  // entry via the effect above instead, and this would otherwise stomp
  // on that scroll immediately after.
  useEffect(() => {
    if (highlightedEntryId) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [tab, natureFilter, goalFilter]);

  function handleTabPress(tabId) {
    setTab(tabId);
    // A fresh manual tab selection retires the notification-driven
    // highlight, whether that's switching away from Mine or just
    // re-tapping it — the highlight is a one-time "you just arrived
    // here" affordance, not a persistent marker.
    setHighlightedEntryId(null);
  }

  async function handleToggleFollow(followeeId) {
    const isFollowing = followedIds.has(followeeId);
    const previous = followedIds;

    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(followeeId);
      else next.add(followeeId);
      return next;
    });

    const { error } = isFollowing
      ? await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('followee_id', followeeId)
      : await supabase.from('follows').insert({ follower_id: session.user.id, followee_id: followeeId });

    if (error) setFollowedIds(previous);
  }

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

  async function handleToggleLike(entryId) {
    const isLiked = likedIds.has(entryId);
    const previous = likedIds;

    setLikedIds((prev) => {
      const next = new Set(prev);
      if (isLiked) next.delete(entryId);
      else next.add(entryId);
      return next;
    });

    // Never touch tickle_entries.like_count here — handle_like_insert /
    // handle_like_delete maintain it server-side; the likedIds change
    // above triggers loadFeed to refetch and pick up the trigger's value.
    const { error } = isLiked
      ? await supabase.from('likes').delete().eq('user_id', session.user.id).eq('entry_id', entryId)
      : await supabase.from('likes').insert({ user_id: session.user.id, entry_id: entryId });

    if (error) {
      setLikedIds(previous);
      return;
    }

    // Not awaited — push delivery shouldn't hold up the optimistic UI
    // update above. Only fires on a fresh like, not on unlike.
    if (!isLiked) notifyLikeReceived(entryId, session.user.id);
  }

  // No revert-to-previous-award-then-retry here, unlike the toggles
  // above -- an award is a one-shot insert, not a toggle, so a failure
  // just means it never happened; rolling awardedTypes back to "no
  // award" is the correct/only recovery, not restoring some prior value.
  async function handleGiveAward(entryId, awardType) {
    setAwardEntryId(null);
    setAwardedTypes((prev) => new Map(prev).set(entryId, awardType));
    setAwardedPublicTypes((prev) => {
      const next = new Map(prev);
      const existing = next.get(entryId) || [];
      if (!existing.includes(awardType)) next.set(entryId, [...existing, awardType]);
      return next;
    });

    const { error } = await supabase
      .from('awards')
      .insert({ entry_id: entryId, user_id: session.user.id, award_type: awardType });

    if (error) {
      setAwardedTypes((prev) => {
        const next = new Map(prev);
        next.delete(entryId);
        return next;
      });
      setAwardedPublicTypes((prev) => {
        const next = new Map(prev);
        const remaining = (next.get(entryId) || []).filter((t) => t !== awardType);
        if (remaining.length) next.set(entryId, remaining);
        else next.delete(entryId);
        return next;
      });
      console.error('handleGiveAward failed', error);
    }
  }

  const goalsById = Object.fromEntries(goals.map((g) => [g.id, g]));
  // Achieved goals are never offered as a new tag target in the picker
  // — they only ever appear read-only, on entries already tagged before
  // achievement (resolved via goalsById above, achieved or not).
  const activeGoals = goals.filter((g) => !g.achieved_at);
  // Goal filter chip row only -- active goals always before achieved
  // ones, rather than interleaved in whatever order `goals` itself
  // comes back in. A plain stable sort on "is achieved" (0/1) preserves
  // each group's existing relative order (the query's own
  // created_at-ascending) with no secondary key needed -- Array.sort is
  // spec-guaranteed stable since ES2019. Scoped to this local variable,
  // not applied to `goals` itself, so goalsById/activeGoals/GoalTagModal
  // above are all untouched.
  const goalFilterChips = [...goals].sort((a, b) => (a.achieved_at ? 1 : 0) - (b.achieved_at ? 1 : 0));

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
    const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);
    const photo = await getPhotoForEntry(session.user.id, entry.id);

    let cardImageUri;
    if (photo) {
      try {
        cardImageUri = await captureCard({
          photo,
          captionLabel: caption.label,
          textContent: entry.text_content,
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

  // Thin wrapper around lib/sharing.js's sharePhotoOnlyEntry (shared
  // with home.js/calendar.js's own Share buttons) -- this file's job is
  // just resolving this screen's own already-loaded linkedPhotoUris into a
  // uri and turning the returned status into the right Alert; the
  // actual skip-ShareModal / bake-in-the-Vibe-label decision logic lives
  // there once, not duplicated per screen.
  async function handlePhotoOnlyShare(entry) {
    const result = await sharePhotoOnlyEntry({
      profile,
      entry,
      photoUri: linkedPhotoUris.get(entry.id) || null,
      captureCard,
      accentColor: accentFor(profile?.accent_theme).card,
      onProfileUpdated: refreshProfile,
    });

    if (result.missingPhoto) {
      Alert.alert(
        "Can't share yet",
        "This photo isn't available on this device right now — relink it, then try sharing again."
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
  // cross-screen refresh mechanism needed. Confirmation dialog lives in
  // EntryCard itself; this only runs once the user has confirmed.
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
  // means Rippled/Following's own visibility-filtered queries stop
  // matching this row next time they reload (loadFeed already reruns on
  // tab change); Home and Mine never filter on visibility, so they keep
  // showing it either way.
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
      const photoUri = linkedPhotoUris.get(entry.id) || null;
      if (!photoUri) {
        Alert.alert(
          "Can't make this public yet",
          "This photo isn't available on this device right now — relink it, then try again."
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

    // A text entry with a Tickle-a-Photo link gets the same upload
    // treatment on Ripple as a photo-only entry -- same underlying
    // mechanic (lib/photoTickleStorage.js). Unlike photo-only, a
    // missing/unresolvable local photo does NOT block the share here:
    // most text entries have no linked photo at all, and even one that
    // does has real text content of its own, so an unresolvable bonus
    // photo just falls through to the plain flip below and shares as
    // text only, rather than blocking the whole Ripple the way
    // photo-only's own no-photo case does above.
    if (entry.entry_kind === 'text' && newVisibility === 'public') {
      const photoUri = linkedPhotoUris.get(entry.id) || null;
      if (photoUri) {
        try {
          const mediaUrl = await makePhotoTicklePublic(entry, photoUri);
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, visibility: 'public', media_url: mediaUrl } : e))
          );
        } catch (err) {
          console.error('handleToggleVisibility: linked-photo upload failed', err);
          Alert.alert(
            "Couldn't make this public",
            `Something went wrong uploading this photo — try again.\n\n${err.message || String(err)}`
          );
        }
        return;
      }
    }

    // Symmetric to the block above -- an already-public text entry
    // whose linked photo was actually uploaded (media_url set) gets the
    // same Storage removal as a photo-only entry going private. Gated
    // on media_url itself rather than a fresh local-link lookup, since
    // only an entry that went through the upload branch above ever has
    // media_url set for entry_kind='text'.
    if (entry.entry_kind === 'text' && newVisibility === 'private' && entry.media_url) {
      try {
        await makePhotoTicklePrivate(entry);
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, visibility: 'private', media_url: null } : e))
        );
      } catch (err) {
        console.error('handleToggleVisibility: linked-photo removal failed', err);
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

  function renderEntry({ item }) {
    return (
      <EntryCard
        item={item}
        currentUserId={session.user.id}
        showMineActions={tab === 'mine'}
        isHighlighted={tab === 'mine' && item.id === highlightedEntryId}
        isFollowing={followedIds.has(item.user_id)}
        isFavorited={favoritedIds.has(item.id)}
        isLiked={likedIds.has(item.id)}
        taggedGoal={item.goal_id ? goalsById[item.goal_id] : null}
        hasLinkedPhoto={photoLinkedIds.has(item.id)}
        photoUri={linkedPhotoUris.get(item.id) || null}
        awardType={awardedTypes.get(item.id) || null}
        publicAwardTypes={awardedPublicTypes.get(item.id) || []}
        onOpenPhoto={handleOpenPhoto}
        onRelinkPhoto={handleRelinkPhoto}
        onLayout={(e) => {
          cardHeights.current[item.id] = e.nativeEvent.layout.height + CARD_SPACING;
        }}
        onToggleFollow={handleToggleFollow}
        onPickGoal={setPickerEntryId}
        onShare={() => (item.entry_kind === 'photo_only' ? handlePhotoOnlyShare(item) : setShareEntryId(item.id))}
        onToggleFavorite={handleToggleFavorite}
        onToggleVisibility={handleToggleVisibility}
        onDelete={handleDeleteEntry}
        onToggleLike={handleToggleLike}
        onGiveAward={setAwardEntryId}
      />
    );
  }

  // Divider position/count derived fresh each render from `entries` +
  // this tab's captured threshold -- not stored state -- so it always
  // matches whatever is actually on screen. Skipped entirely (no divider)
  // when nothing is new (newCount === 0) or when every currently-loaded
  // entry is new (newCount === entries.length -- nothing "already seen"
  // is loaded to separate from).
  const dividerThresholdMs =
    tab === 'following' || tab === 'rippled' ? dividerThresholds[tab] : null;
  let listData = entries;
  if (dividerThresholdMs != null) {
    const newCount = entries.filter((e) => new Date(e.created_at).getTime() > dividerThresholdMs).length;
    if (newCount > 0 && newCount < entries.length) {
      listData = [
        ...entries.slice(0, newCount),
        { __divider: true, id: `${tab}-divider`, label: dividerLabel(tab, newCount) },
        ...entries.slice(newCount),
      ];
    }
  }

  function renderListItem({ item }) {
    if (item.__divider) {
      return (
        <View
          style={styles.divider}
          onLayout={(e) => {
            cardHeights.current[item.id] = e.nativeEvent.layout.height + CARD_SPACING;
          }}
        >
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{item.label}</Text>
          <View style={styles.dividerLine} />
        </View>
      );
    }
    return renderEntry({ item });
  }

  const pickerEntry = entries.find((e) => e.id === pickerEntryId) || null;
  const shareTargetEntry = entries.find((e) => e.id === shareEntryId) || null;
  // AwardPickerModal needs the actual entry (not just its id) so its
  // wordweaver row can pick the right photo-only-aware phrase -- same
  // lookup pattern as shareTargetEntry above.
  const awardTargetEntry = entries.find((e) => e.id === awardEntryId) || null;
  const shareStat = profile ? shareStatus(profile) : null;
  const shareBlocked = !!shareStat && !shareStat.unlimited && shareStat.remaining <= 0;

  return (
    <>
    <WallpaperBackground>
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>Tickle Stash</Text>
        <CornerNav style={styles.cornerNavInline} />
      </View>
      {highlightedEntryId && (
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>
      )}

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => handleTabPress(t.id)}
            style={[
              styles.tabButton,
              tab === t.id && { backgroundColor: accentDark, borderColor: accentDark },
            ]}
          >
            <Text style={[styles.tabLabel, tab === t.id && { color: accentDarkText }]}>{t.label}</Text>
            {NEW_SINCE_TABS.includes(t.id) && <CountBadge count={badgeCounts[t.id]} />}
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'mine' && (
        <View style={styles.natureFilterRow}>
          {[
            { id: 'all', label: 'All' },
            ...NATURE_FILTERS,
            DAY_JOURNAL_FILTER,
          ].map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => {
                // Picking any nature chip (including "All") always clears
                // an active Goal filter -- the two are mutually exclusive,
                // never combined (see goalFilter's own comment above).
                setGoalFilter(null);
                setNatureFilter(f.id);
              }}
              style={[
                styles.natureFilterChip,
                !goalFilter && natureFilter === f.id && { backgroundColor: accentDark, borderColor: accentDark },
              ]}
            >
              <Text
                style={[
                  styles.natureFilterLabel,
                  !goalFilter && natureFilter === f.id && { color: accentDarkText },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Goal filter chips -- horizontal ScrollView rather than
          flexWrap or truncating the row itself: the nature row above
          already uses ~95% of its available width with five short fixed
          labels (measured on-device), and goal labels are free user text
          up to 60 characters, so a plain wrapping row risked silently
          clipping or pushing chips off-screen. Hidden entirely when there
          are no goals at all -- an empty scrollable row would just be
          clutter for anyone who's never created one. Shows every goal
          (`goals`, not `activeGoals`) including achieved ones,
          unconditionally and with no visual distinction -- same
          precedent as Calendar's Goals view, which draws its day-dots
          from the full list too. */}
      {tab === 'mine' && goals.length > 0 && (
        <View style={styles.goalFilterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.goalFilterRow}
            style={styles.goalFilterScroll}
          >
            {goalFilterChips.map((g) => (
              <TouchableOpacity
                key={g.id}
                onPress={() => setGoalFilter(g.id)}
                style={[
                  styles.goalFilterChip,
                  goalFilter === g.id && { backgroundColor: accentDark, borderColor: accentDark },
                ]}
              >
                {/* Same lighten(0.6)/checkmark-darken(0.4) formula as
                    goals.js/GoalTagModal/EntryCard's own achieved-goal
                    dots -- dot-only here (label/background untouched),
                    matching EntryCard's scope rather than goals.js's
                    fuller treatment (which also mutes the label). Icon
                    size scaled down from those dots' own size:10 on a
                    14-16px dot (~0.65x diameter) to size:6 here, since
                    this dot is only 8px -- a literal size:10 checkmark
                    would overflow it. */}
                <View
                  style={[
                    styles.goalFilterDot,
                    { backgroundColor: g.achieved_at ? lighten(g.color, 0.6) : g.color },
                  ]}
                >
                  {!!g.achieved_at && (
                    <Ionicons name="checkmark" size={6} color={darken(g.color, 0.4)} />
                  )}
                </View>
                <Text
                  style={[
                    styles.goalFilterLabel,
                    // Muted to echo goals.js's own goalLabelAchieved
                    // (color: C.subtext there) -- but this label's own
                    // unselected baseline (goalFilterLabel) is ALREADY
                    // C.subtext, same as every other filter chip in this
                    // row, so setting achieved to that same value would
                    // be invisible. C.faint is one step fainter still,
                    // the actual visible mute goals.js's default->
                    // subtext step achieves relative to ITS OWN default
                    // (C.text). Applied before the selected-state
                    // override below so a selected-AND-achieved chip
                    // still gets accentDarkText for contrast against
                    // accentDark, rather than staying faint on a dark
                    // background.
                    !!g.achieved_at && { color: C.faint },
                    goalFilter === g.id && { color: accentDarkText },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {tab === 'mine' && !goalFilter && natureFilter === 'day_journal' && dayDots && (
        <DayDotsCard
          accentColor={accentFor(profile?.accent_theme).card}
          phase={dayDots.phase}
          selectedDotIndex={dayDots.dotIndex}
          onSelectDot={handleDayDotsSelect}
          onSkip={handleDayDotsSkip}
        />
      )}

      {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

      <FlatList
        ref={listRef}
        style={styles.list}
        data={listData}
        keyExtractor={(item) => (item.__divider ? item.id : String(item.id))}
        renderItem={renderListItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: styles.listContent.paddingBottom + tabBarHeight }]}
        getItemLayout={(data, index) => {
          let offset = 0;
          for (let i = 0; i < index; i++) {
            offset += cardHeights.current[data[i].id] ?? DEFAULT_ITEM_HEIGHT;
          }
          const length = cardHeights.current[data[index].id] ?? DEFAULT_ITEM_HEIGHT;
          return { length, offset, index };
        }}
        onScrollToIndexFailed={(info) => {
          // getItemLayout's estimate should make this rare, but a card
          // running much taller than average (long entry text) could
          // still throw scrollToIndex off — retry once measurement
          // catches up, using RN's recommended fallback pattern.
          setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }, 50);
        }}
        ListEmptyComponent={!loading && <Text style={styles.emptyText}>{getEmptyText(tab, natureFilter, goalFilter)}</Text>}
      />
    </View>
    </WallpaperBackground>

    <GoalTagModal
      entry={pickerEntry}
      goals={activeGoals}
      taggedGoal={pickerEntry?.goal_id ? goalsById[pickerEntry.goal_id] : null}
      onAssign={(goalId) => assignGoal(pickerEntry.id, goalId)}
      onDismiss={() => setPickerEntryId(null)}
    />

    <AwardPickerModal
      entryId={awardEntryId}
      entryKind={awardTargetEntry?.entry_kind}
      onGive={(awardType) => handleGiveAward(awardEntryId, awardType)}
      onDismiss={() => setAwardEntryId(null)}
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
  container: { flex: 1, paddingHorizontal: 20 },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  // Cancels CornerNav's own marginBottom now that it's nested inside
  // titleRow instead of standing alone -- same reasoning/pattern as
  // home.js's own cornerNavInline.
  cornerNavInline: { marginBottom: 0 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, flexShrink: 1 },

  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  tabButton: {
    flex: 1, paddingVertical: 10, borderRadius: 20, position: 'relative',
    alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  tabLabel: { fontSize: 12, fontWeight: '600', color: C.subtext },

  // Nested one level in from tabRow above, and deliberately lighter —
  // smaller padding/radius/font, content-sized chips rather than
  // flex:1 — so this reads as a secondary refinement of Mine, not a
  // second peer tab row.
  natureFilterRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  natureFilterChip: {
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
  },
  natureFilterLabel: { fontSize: 11, fontWeight: '600', color: C.subtext },

  // The height fix lives on THIS wrapping View, not on the ScrollView
  // itself -- confirmed on-device that setting height directly via a
  // horizontal ScrollView's own `style` is silently ignored on Android
  // (a known RN/Android issue: the ScrollView still measured ~950px
  // tall with height:34 set directly on it, verified against a
  // guaranteed-fresh bundle, not a caching artifact). Wrapping it in a
  // plain View that itself has the fixed height, with the ScrollView
  // just told to fill that wrapper (flex:1 below), is the documented
  // workaround. 34 isn't a guess -- natureFilterChip's own identical
  // paddingVertical/borderWidth/fontSize measured at 80px tall
  // on-device (1080x2400 @ 3x DPR = 26.7dp), and 34 gives ~7dp of
  // headroom above that for font-scale/rendering variance. This is the
  // one row in this file that needs an explicit height at all --
  // every other filter row here is a plain View, which sizes to
  // content correctly with no such quirk.
  goalFilterWrap: { height: 34, marginBottom: 16 },
  goalFilterScroll: { flex: 1 },
  // alignItems: 'center' is also load-bearing, not cosmetic -- without
  // it this row defaults to RN's 'stretch' cross-axis alignment same as
  // any other row, but inside a horizontal ScrollView specifically that
  // stretches each chip to fill the wrapper's 34dp height rather than
  // sizing each chip to its own content.
  goalFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  // Same paddingVertical/Horizontal/borderRadius/border as
  // natureFilterChip -- only difference is the dot + maxWidth, so a Goal
  // chip reads as the same visual family, not a new one. maxWidth: 160
  // derived from this same chip's own measured overhead (24dp padding +
  // 2dp border + 8dp dot + 6dp dot-gap = 40dp) plus the nature chips'
  // own measured ~6dp/char label width -- leaves ~120dp (~20 characters)
  // of text before truncating, comfortably past a typical short goal
  // name but well short of the 60-char max `goals.label` allows.
  goalFilterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
    maxWidth: 160, overflow: 'hidden',
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
  },
  goalFilterDot: {
    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  goalFilterLabel: { fontSize: 11, fontWeight: '600', color: C.subtext, flexShrink: 1 },

  // "New since you were here" divider -- plain text label, deliberately
  // no icon (would overlap with the High Five hand icon's existing
  // meaning elsewhere on the card).
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 11, fontWeight: '600', color: C.subtext },

  loader: { marginTop: 12 },
  list: { flex: 1 },
  listContent: { paddingBottom: 40 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24 },
});
