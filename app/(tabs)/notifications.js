import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import { supabase } from '../../lib/supabase';
import { C } from '../../lib/theme';
import { showSaveFailed } from '../../lib/themedAlert';
import WallpaperBackground from '../../components/WallpaperBackground';
import CornerNav from '../../components/CornerNav';
import {
  buildNotificationItems,
  NotificationSheetHeader,
  NotificationSheetRow,
} from '../../components/NotificationRow';

// The Mark all as read link's text is about 18dp tall; 13dp above and
// below brings it to 44dp to tap.
const MARK_ALL_HIT_SLOP = { top: 13, bottom: 13, left: 8, right: 8 };

export default function Notifications() {
  const { session } = useAuth();
  const { refreshUnreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Pull-down refresh has its own spinner (RefreshControl), separate from
  // the first-load one, so the list never blanks while it reloads.
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!session) return;
    if (!silent) setLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select(
        'id, type, award_type, tale_id, is_read, created_at, entry_id, actor_id, tickle_entries(text_content), tales(title, icon), profiles!notifications_actor_id_fkey(username, avatar_emoji, country)'
      )
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false });

    setLoadError(!!error);
    if (!error) setNotifications(data || []);
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  // Read-only, like the focus load: nothing is marked read here (only
  // tapping a row, in handlePress, or Mark all as read does that).
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.allSettled([loadNotifications({ silent: true }), refreshUnreadCount()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function handlePress(n) {
    if (!n.is_read) {
      const previous = notifications;
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', n.id)
        .eq('recipient_id', session.user.id);

      if (error) setNotifications(previous);
      else refreshUnreadCount();
    }

    // A Tale chapter is someone else's entry, so the Mine-tab highlight
    // route below would land on nothing -- open the Tale itself instead.
    if (n.type === 'tale_chapter' && n.tale_id) {
      router.push({ pathname: '/tale', params: { id: n.tale_id } });
    } else if (n.entry_id) {
      router.push({ pathname: '/feed', params: { tab: 'mine', highlightEntry: n.entry_id } });
    }
  }

  // Marks every unread notification read: the list first, then one
  // update; on success the badge recounts, on failure the list is put
  // back and the usual "couldn't save" alert shows. The existing update
  // policy (recipient only) already allows this.
  async function handleMarkAllRead() {
    const previous = notifications;
    setNotifications((prev) => prev.map((x) => (x.is_read ? x : { ...x, is_read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', session.user.id)
      .eq('is_read', false);
    if (error) {
      setNotifications(previous);
      showSaveFailed();
    } else {
      refreshUnreadCount();
    }
  }

  const unreadInList = notifications.filter((x) => !x.is_read).length;
  const items = buildNotificationItems(notifications);

  function renderItem({ item }) {
    return item.kind === 'header'
      ? <NotificationSheetHeader item={item} />
      : <NotificationSheetRow item={item} onPress={handlePress} />;
  }

  return (
    <WallpaperBackground>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Notifications</Text>
          <CornerNav style={styles.cornerNavInline} />
        </View>

        {unreadInList > 0 && (
          <View style={styles.unreadLine}>
            <Text style={styles.unreadCount}>{unreadInList} unread</Text>
            <TouchableOpacity
              onPress={handleMarkAllRead}
              hitSlop={MARK_ALL_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
            >
              <Text style={styles.markAll}>Mark all as read</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: styles.listContent.paddingBottom + tabBarHeight }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.rust]} tintColor={C.rust} />
          }
          ListEmptyComponent={
            !loading && (
              <Text style={styles.emptyText}>
                {loadError ? "Couldn't load your notifications — please try again later." : 'No notifications yet.'}
              </Text>
            )
          }
        />
      </View>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  // Same title row as the Calendar's: the title (wraps to a second line
  // if it doesn't fit) and the CornerNav icons on the right. Its 16dp
  // bottom margin is the gap the title used to have.
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  // Cancels CornerNav's own marginBottom inside titleRow (as on Calendar).
  cornerNavInline: { marginBottom: 0 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, flexShrink: 1 },

  loader: { marginTop: 12 },
  list: { flex: 1 },
  listContent: { paddingBottom: 40 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24 },

  // "N unread" and the Mark all as read link, between the title row and
  // the sheet.
  unreadLine: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    // 6dp lower than the title row's 16dp gap, so the link's 13dp tap
    // slop doesn't reach the top-row icons' own.
    marginTop: 6, marginBottom: 12,
  },
  unreadCount: { fontSize: 13, color: C.subtext, flexShrink: 1 },
  markAll: { fontSize: 13, fontWeight: '700', color: C.rustDark, textDecorationLine: 'underline' },
});
