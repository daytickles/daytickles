import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';

function formatTimestamp(createdAt) {
  return new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// The type column is a Postgres check constraint ('like' | 'comment' |
// 'streak_milestone'), but only 'like' has real UI built on top of it
// so far — comment/streak_milestone rows are handled defensively so a
// row of either type never crashes this screen, just degrades to a
// generic line.
function notificationText(n) {
  const actorName = n.profiles?.username || 'Someone';
  const entryText = n.tickle_entries?.text_content;

  switch (n.type) {
    case 'like':
      return entryText ? `${actorName} liked your tickle: ${entryText}` : `${actorName} liked your tickle`;
    case 'comment':
      return entryText ? `${actorName} commented on your tickle: ${entryText}` : `${actorName} commented on your tickle`;
    case 'streak_milestone':
      return 'You hit a streak milestone! 🔥';
    default:
      return 'New notification';
  }
}

export default function Notifications() {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select(
        'id, type, is_read, created_at, entry_id, actor_id, tickle_entries(text_content), profiles!notifications_actor_id_fkey(username, avatar_emoji)'
      )
      .eq('recipient_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error) setNotifications(data || []);
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

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
    }

    if (n.entry_id) {
      router.push({ pathname: '/feed', params: { tab: 'mine', highlightEntry: n.entry_id } });
    }
  }

  function renderNotification({ item }) {
    return (
      <TouchableOpacity
        style={[styles.row, !item.is_read && styles.rowUnread]}
        onPress={() => handlePress(item)}
      >
        {!item.is_read && <View style={styles.unreadDot} />}
        <View style={styles.rowBody}>
          <Text style={[styles.rowText, !item.is_read && styles.rowTextUnread]}>{notificationText(item)}</Text>
          <Text style={styles.rowDate}>{formatTimestamp(item.created_at)}</Text>
        </View>
      </TouchableOpacity>
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

      <Text style={styles.title}>Notifications</Text>

      {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

      <FlatList
        style={styles.list}
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderNotification}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading && <Text style={styles.emptyText}>No notifications yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 60, paddingHorizontal: 20 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 16 },

  loader: { marginTop: 12 },
  list: { flex: 1 },
  listContent: { paddingBottom: 40 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24 },

  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10,
  },
  rowUnread: { backgroundColor: C.sparkleBg },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.rust,
    marginRight: 10, marginTop: 6,
  },
  rowBody: { flex: 1 },
  rowText: { fontSize: 14, color: C.text, lineHeight: 20 },
  rowTextUnread: { fontWeight: '700', color: C.rustDark },
  rowDate: { fontSize: 12, color: C.subtext, marginTop: 6 },
});
