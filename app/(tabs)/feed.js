import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor, darken, textOn } from '../../lib/theme';
import { shareEntry, shareStatus, SHARE_CAPTIONS } from '../../lib/sharing';
import { notifyLikeReceived } from '../../lib/likeNotify';
import GoalTagModal from '../../components/GoalTagModal';
import AwardPickerModal from '../../components/AwardPickerModal';
import ShareModal from '../../components/ShareModal';
import PhotoEnlargeModal from '../../components/PhotoEnlargeModal';
import EntryCard, { CARD_SPACING } from '../../components/EntryCard';
import CornerNav from '../../components/CornerNav';
import WallpaperBackground from '../../components/WallpaperBackground';
import { initPinBoardDb, getAllLinkedEntryIds, getPhotoForEntry } from '../../lib/pinBoardDb';
import { useShareCard } from '../../lib/useShareCard';

const TABS = [
  { id: 'mine', label: 'Mine' },
  { id: 'favorites', label: "Fav's" },
  { id: 'following', label: 'Following' },
  { id: 'rippled', label: 'Rippled' },
];

// Mine-only. 'all' is the default: everything, tagged or not, same as
// no filter applied.
const NATURE_FILTERS = [
  { id: 'received', label: 'Smiles' },
  { id: 'given', label: 'Given' },
  { id: 'self', label: 'For me' },
];

// Independent of tickle_nature_enabled — day_journal_enabled can show
// this chip on its own, same as create.js's picker.
const DAY_JOURNAL_FILTER = { id: 'day_journal', label: 'Journal' };

const EMPTY_TEXT = {
  mine: "You haven't shared any tickles to the feed yet.",
  favorites: 'Tap the star on a tickle to save it here.',
  following: 'Follow people to see their tickles here.',
  rippled: 'No public tickles yet.',
};

// Mine's Day Journal filter needs its own empty message rather than the
// generic `mine` one above -- that message talks about sharing to the
// feed, which is wrong here since Journal entries are private by design
// and Mine shows entries regardless of sharing status anyway.
function getEmptyText(tab, natureFilter) {
  if (tab === 'mine' && natureFilter === 'day_journal') {
    return 'Write your first Day Journal entry to see it here.';
  }
  return EMPTY_TEXT[tab];
}

const ENTRY_SELECT =
  'id, entry_date, text_content, like_count, tickle_nature, goal_id, visibility, is_edited, created_at, user_id, profiles!tickle_entries_user_id_fkey(username, avatar_emoji, accent_theme, country, founding_member_number)';

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

  async function handleOpenPhoto(entryId) {
    const photo = await getPhotoForEntry(session.user.id, entryId);
    if (photo) setEnlargeUri(photo.file_path);
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
    const loadKey = `${tab}:${natureFilter}`;
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
      if (natureFilter !== 'all') query = query.eq('tickle_nature', natureFilter);
    } else {
      query = query.eq('visibility', 'public');
    }

    const { data, error } = await query;
    if (!error) {
      const entriesData = data || [];
      const awardedTypesById = await fetchAwardedEntryTypes(entriesData.map((e) => e.id));
      setEntries(entriesData);
      setAwardedPublicTypes(awardedTypesById);
    }
    setLoading(false);
    // likedIds isn't used to filter any query above — it's a dependency
    // purely so a like/unlike triggers this refetch, pulling like_count
    // fresh from the DB rather than ever computing it locally.
  }, [session, tab, natureFilter, followedIds, favoritedIds, likedIds]);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  useEffect(() => {
    if (tab !== 'mine' || !highlightedEntryId) return;
    const index = entries.findIndex((e) => e.id === highlightedEntryId);
    if (index === -1) return;

    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }, [tab, highlightedEntryId, entries]);

  // Scroll back to the top on every tab switch (Mine/Fav's/Following/
  // Rippled) or Mine's nature-filter chip switch (All/Smiles/
  // Given/Boost/Journal) so a newly-selected tab or filter doesn't inherit
  // whatever scroll position the previous one was left at. Skipped when
  // a highlightEntry deep link just set the tab -- that case scrolls to
  // the specific highlighted entry via the effect above instead, and
  // this would otherwise stomp on that scroll immediately after.
  useEffect(() => {
    if (highlightedEntryId) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [tab, natureFilter]);

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

  // Real DELETE, not a soft-hide — RLS already scopes it to entries you
  // own, and every table referencing tickle_entries (likes, favorites,
  // notifications, shares, etc.) cascades on delete (confirmed against
  // the schema before building this). Home and Tickle Stash each reload their
  // own entries on focus already, so a deletion made on one screen is
  // picked up by the other the next time it's revisited — no separate
  // cross-screen refresh mechanism needed. Confirmation dialog lives in
  // EntryCard itself; this only runs once the user has confirmed.
  async function handleDeleteEntry(entryId) {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entryId));

    const { error } = await supabase.from('tickle_entries').delete().eq('id', entryId);
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
        awardType={awardedTypes.get(item.id) || null}
        publicAwardTypes={awardedPublicTypes.get(item.id) || []}
        onOpenPhoto={handleOpenPhoto}
        onLayout={(e) => {
          cardHeights.current[item.id] = e.nativeEvent.layout.height + CARD_SPACING;
        }}
        onToggleFollow={handleToggleFollow}
        onPickGoal={setPickerEntryId}
        onShare={setShareEntryId}
        onToggleFavorite={handleToggleFavorite}
        onToggleVisibility={handleToggleVisibility}
        onDelete={(entry) => handleDeleteEntry(entry.id)}
        onToggleLike={handleToggleLike}
        onGiveAward={setAwardEntryId}
      />
    );
  }

  const pickerEntry = entries.find((e) => e.id === pickerEntryId) || null;
  const shareTargetEntry = entries.find((e) => e.id === shareEntryId) || null;
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
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'mine' && (
        <View style={styles.natureFilterRow}>
          {[
            { id: 'all', label: 'All' },
            ...NATURE_FILTERS,
            ...(profile?.day_journal_enabled ? [DAY_JOURNAL_FILTER] : []),
          ].map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setNatureFilter(f.id)}
              style={[
                styles.natureFilterChip,
                natureFilter === f.id && { backgroundColor: accentDark, borderColor: accentDark },
              ]}
            >
              <Text
                style={[
                  styles.natureFilterLabel,
                  natureFilter === f.id && { color: accentDarkText },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

      <FlatList
        ref={listRef}
        style={styles.list}
        data={entries}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderEntry}
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
        ListEmptyComponent={!loading && <Text style={styles.emptyText}>{getEmptyText(tab, natureFilter)}</Text>}
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
    flex: 1, paddingVertical: 10, borderRadius: 20,
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

  loader: { marginTop: 12 },
  list: { flex: 1 },
  listContent: { paddingBottom: 40 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24 },
});
