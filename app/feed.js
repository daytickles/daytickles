import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, moodColorFor } from '../lib/theme';

function formatEntryDate(entryDate) {
  return new Date(`${entryDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const TABS = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'following', label: 'Following' },
  { id: 'mine', label: 'Mine' },
  { id: 'favorites', label: "Fav's" },
];

const EMPTY_TEXT = {
  everyone: 'No public tickles yet.',
  following: 'Follow people to see their tickles here.',
  mine: "You haven't shared any tickles to the feed yet.",
  favorites: 'Tap the star on a tickle to save it here.',
};

const ENTRY_SELECT =
  'id, entry_date, text_content, mood, like_count, created_at, user_id, profiles!tickle_entries_user_id_fkey(username, avatar_emoji, accent_theme)';

// Mine shows entries fully untruncated (deliberate — people should be
// able to read the complete text), so real cards range from one line to
// fifteen-plus. A single fixed height can't represent that, so
// getItemLayout below sums each card's *actual measured* height
// (recorded via onLayout into cardHeights, keyed by entry id) instead of
// assuming a uniform size. DEFAULT_ITEM_HEIGHT is only the fallback used
// for cards that haven't rendered/measured yet — matches entryCard's
// typical single-line size (102.33px measured + CARD_SPACING).
const DEFAULT_ITEM_HEIGHT = 114;
const CARD_SPACING = 12; // must match entryCard's marginBottom below

export default function Feed() {
  const { session } = useAuth();
  const params = useLocalSearchParams();
  const initialTab = TABS.some((t) => t.id === params.tab) ? params.tab : 'everyone';
  const [tab, setTab] = useState(initialTab);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followedIds, setFollowedIds] = useState(new Set());
  const [favoritedIds, setFavoritedIds] = useState(new Set());
  const [likedIds, setLikedIds] = useState(new Set());
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
    } else {
      query = query.eq('visibility', 'public');
    }

    const { data, error } = await query;
    if (!error) setEntries(data || []);
    setLoading(false);
    // likedIds isn't used to filter any query above — it's a dependency
    // purely so a like/unlike triggers this refetch, pulling like_count
    // fresh from the DB rather than ever computing it locally.
  }, [session, tab, followedIds, favoritedIds, likedIds]);

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

    if (error) setLikedIds(previous);
  }

  function renderEntry({ item }) {
    const accent = accentFor(item.profiles?.accent_theme);
    const isOwnEntry = item.user_id === session.user.id;
    const isFollowingAuthor = followedIds.has(item.user_id);
    const isFavorited = favoritedIds.has(item.id);
    const isLiked = likedIds.has(item.id);
    const isHighlighted = tab === 'mine' && item.id === highlightedEntryId;

    return (
      <View
        style={[styles.entryCard, isHighlighted && styles.highlightedCard]}
        onLayout={(e) => {
          cardHeights.current[item.id] = e.nativeEvent.layout.height + CARD_SPACING;
        }}
      >
        <View style={styles.entryRow}>
          <View style={[styles.moodDot, { backgroundColor: moodColorFor(item.mood, accent) }]} />
          <View style={styles.entryBody}>
            <Text style={styles.authorText}>
              {item.profiles?.avatar_emoji} {item.profiles?.username}
            </Text>
            <Text style={styles.entryText}>{item.text_content}</Text>
            <View style={styles.entryMetaRow}>
              <Text style={styles.entryDate}>{formatEntryDate(item.entry_date)}</Text>
              <View style={styles.entryMetaRight}>
                {!isOwnEntry && (
                  <TouchableOpacity
                    onPress={() => handleToggleFollow(item.user_id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={[styles.followLink, isFollowingAuthor && styles.followLinkActive]}>
                      {isFollowingAuthor ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                )}
                {!isOwnEntry && (
                  <TouchableOpacity
                    onPress={() => handleToggleLike(item.id)}
                    style={styles.likeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={isLiked ? 'sparkles' : 'sparkles-outline'}
                      size={16}
                      color={isLiked ? C.sparkleText : C.faint}
                    />
                    <Text style={[styles.likeCount, isLiked && styles.likeCountActive]}>{item.like_count || 0}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => handleToggleFavorite(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.starIcon, isFavorited && styles.starIconActive]}>
                    {isFavorited ? '★' : '☆'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
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
            style={[styles.tabButton, tab === t.id && styles.tabButtonActive]}
          >
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 60, paddingHorizontal: 20 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 16 },

  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  tabButton: {
    flex: 1, paddingVertical: 10, borderRadius: 20,
    alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  tabButtonActive: { backgroundColor: C.rust, borderColor: C.rust },
  tabLabel: { fontSize: 12, fontWeight: '600', color: C.subtext },
  tabLabelActive: { color: C.bg },

  loader: { marginTop: 12 },
  list: { flex: 1 },
  listContent: { paddingBottom: 40 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24 },

  entryCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: CARD_SPACING,
  },
  highlightedCard: {
    borderWidth: 1.5, borderColor: C.amberDark, backgroundColor: C.sparkleBg,
  },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  moodDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12, marginTop: 4 },
  entryBody: { flex: 1 },
  authorText: { fontSize: 13, fontWeight: '600', color: C.rustDark, marginBottom: 4 },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },

  entryMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
  },
  entryDate: { fontSize: 12, color: C.subtext },
  entryMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  followLink: { fontSize: 12, fontWeight: '600', color: C.rust },
  followLinkActive: { color: C.subtext },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeCount: { fontSize: 12, fontWeight: '600', color: C.faint },
  likeCountActive: { color: C.sparkleText },
  starIcon: { fontSize: 18, color: C.faint },
  starIconActive: { color: C.amberDark },
});
