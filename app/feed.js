import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, darken, textOn } from '../lib/theme';
import { shareEntry, shareStatus, SHARE_CAPTIONS } from '../lib/sharing';
import { notifyLikeReceived } from '../lib/likeNotify';
import GoalTagModal from '../components/GoalTagModal';
import ShareModal from '../components/ShareModal';
import PhotoEnlargeModal from '../components/PhotoEnlargeModal';
import EntryCard, { CARD_SPACING } from '../components/EntryCard';
import { getAllLinkedEntryIds, getPhotoForEntry } from '../lib/pinBoardDb';
import { useShareCard } from '../lib/useShareCard';

const TABS = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'following', label: 'Following' },
  { id: 'mine', label: 'Mine' },
  { id: 'favorites', label: "Fav's" },
];

// Mine-only. 'all' is the default: everything, tagged or not, same as
// no filter applied.
const NATURE_FILTERS = [
  { id: 'received', label: 'My smiles' },
  { id: 'given', label: 'Given' },
  { id: 'self', label: 'For me' },
];

// Independent of tickle_nature_enabled — day_journal_enabled can show
// this chip on its own, same as create.js's picker.
const DAY_JOURNAL_FILTER = { id: 'day_journal', label: 'DJ' };

const EMPTY_TEXT = {
  everyone: 'No public tickles yet.',
  following: 'Follow people to see their tickles here.',
  mine: "You haven't shared any tickles to the feed yet.",
  favorites: 'Tap the star on a tickle to save it here.',
};

const ENTRY_SELECT =
  'id, entry_date, text_content, mood, like_count, tickle_nature, goal_id, visibility, is_edited, created_at, user_id, profiles!tickle_entries_user_id_fkey(username, avatar_emoji, accent_theme, country)';

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

export default function Feed() {
  const { session, profile, refreshProfile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const accentDarkText = textOn(accentDark);
  const params = useLocalSearchParams();
  const initialTab = TABS.some((t) => t.id === params.tab) ? params.tab : 'everyone';
  const [tab, setTab] = useState(initialTab);
  const [natureFilter, setNatureFilter] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [pickerEntryId, setPickerEntryId] = useState(null);
  const [shareEntryId, setShareEntryId] = useState(null);
  const [followedIds, setFollowedIds] = useState(new Set());
  const [favoritedIds, setFavoritedIds] = useState(new Set());
  const [likedIds, setLikedIds] = useState(new Set());
  const [photoLinkedIds, setPhotoLinkedIds] = useState(new Set());
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

  // Follow/favorite/like state is loaded independently of the active
  // tab — Everyone needs followedIds for its Follow/Following buttons,
  // every tab needs favoritedIds and likedIds for its star/sparkle
  // icons, regardless of which tab is currently showing.
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

  useFocusEffect(
    useCallback(() => {
      loadFollowed();
    }, [loadFollowed])
  );

  useFocusEffect(
    useCallback(() => {
      loadFavorited();
    }, [loadFavorited])
  );

  useFocusEffect(
    useCallback(() => {
      loadLiked();
    }, [loadLiked])
  );

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  // Local-only Pin Board links (see lib/pinBoardDb.js) — loaded the same
  // way as followedIds/favoritedIds/likedIds above: independent of tab,
  // since a link only ever exists for this device's own entries no
  // matter which tab surfaces them.
  const loadPhotoLinks = useCallback(async () => {
    if (!session) return;
    const ids = await getAllLinkedEntryIds(session.user.id);
    setPhotoLinkedIds(new Set(ids));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadPhotoLinks();
    }, [loadPhotoLinks])
  );

  async function handleOpenPhoto(entryId) {
    const photo = await getPhotoForEntry(session.user.id, entryId);
    if (photo) setEnlargeUri(photo.file_path);
  }

  const loadFeed = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    if (tab === 'following') {
      // Followed accounts' public entries only — RLS blocks their private
      // ones regardless, following someone doesn't grant extra visibility.
      const followeeIds = Array.from(followedIds);
      if (followeeIds.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('tickle_entries')
        .select(ENTRY_SELECT)
        .eq('visibility', 'public')
        .in('user_id', followeeIds)
        .order('created_at', { ascending: false });
      if (!error) setEntries(data || []);
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
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('tickle_entries')
        .select(ENTRY_SELECT)
        .in('id', favIds)
        .order('created_at', { ascending: false });
      if (!error) setEntries(data || []);
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
    if (!error) setEntries(data || []);
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
  // the schema before building this). Home and Feed each reload their
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
  // means Everyone/Following's own visibility-filtered queries stop
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
      />
    );
  }

  const pickerEntry = entries.find((e) => e.id === pickerEntryId) || null;
  const shareTargetEntry = entries.find((e) => e.id === shareEntryId) || null;
  const shareStat = profile ? shareStatus(profile) : null;
  const shareBlocked = !!shareStat && !shareStat.unlimited && shareStat.remaining <= 0;

  return (
    <>
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.backLink}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Feed</Text>

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
        contentContainerStyle={styles.listContent}
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
        ListEmptyComponent={!loading && <Text style={styles.emptyText}>{EMPTY_TEXT[tab]}</Text>}
      />
    </View>

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
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 60, paddingHorizontal: 20 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 16 },

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
