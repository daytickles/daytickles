import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationsContext';
import { supabase } from '../lib/supabase';
import { C, AWARD_TYPES } from '../lib/theme';
import { flagEmoji } from '../lib/country';
import WallpaperBackground from '../components/WallpaperBackground';

function formatTimestamp(createdAt) {
  return new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// The type column is a Postgres check constraint ('like' | 'comment' |
// 'streak_milestone' | 'favorite' | 'award', see migration 0020 for the
// latter two), but 'comment' has no real UI built on top of it yet —
// that row type is handled defensively so it never crashes this screen,
// just degrades to a generic line.
function notificationText(n) {
  const flag = n.profiles?.country ? ` ${flagEmoji(n.profiles.country)}` : '';
  const actorName = n.profiles?.username ? `${n.profiles.username}${flag}` : 'Someone';
  const entryText = n.tickle_entries?.text_content;

  switch (n.type) {
    case 'like':
      return entryText ? `${actorName} liked your tickle: ${entryText}` : `${actorName} liked your tickle`;
    case 'favorite':
      return entryText ? `${actorName} fav'ed your tickle: ${entryText}` : `${actorName} fav'ed your tickle`;
    case 'award': {
      const award = AWARD_TYPES[n.award_type];
      const awardPhrase = award ? `a ${award.label} award` : 'an award';
      return entryText
        ? `${actorName} gave your tickle ${awardPhrase}: ${entryText}`
        : `${actorName} gave your tickle ${awardPhrase}`;
    }
    case 'comment':
      return entryText ? `${actorName} commented on your tickle: ${entryText}` : `${actorName} commented on your tickle`;
    case 'streak_milestone':
      return 'You hit a streak milestone! 🔥';
    default:
      return 'New notification';
  }
}

// Left-border accent, distinct per type -- only favorite/award get one;
// like/comment/streak_milestone keep the plain unaccented row they've
// always had. Award reuses that specific award's own hue-verified color
// (lib/theme.js's AWARD_TYPES) rather than inventing a fourth, since the
// notification and the on-card icon should read as the same thing.
function notificationAccent(n) {
  if (n.type === 'favorite') return C.teal;
  if (n.type === 'award') return AWARD_TYPES[n.award_type]?.color || null;
  return null;
}

export default function Notifications() {
  const { session } = useAuth();
  const { refreshUnreadCount } = useNotifications();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('notifications')
      .select(
        'id, type, award_type, is_read, created_at, entry_id, actor_id, tickle_entries(text_content), profiles!notifications_actor_id_fkey(username, avatar_emoji, country)'
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
      else refreshUnreadCount();
    }

    if (n.entry_id) {
      router.push({ pathname: '/feed', params: { tab: 'mine', highlightEntry: n.entry_id } });
    }
  }

  function renderNotification({ item }) {
    const accent = notificationAccent(item);
    return (
      <TouchableOpacity
        style={[
          styles.row,
          !item.is_read && styles.rowUnread,
          accent && { borderLeftWidth: 4, borderLeftColor: accent },
        ]}
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
    <WallpaperBackground>
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
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 20 },
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
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal,
    marginRight: 10, marginTop: 6,
  },
  rowBody: { flex: 1 },
  rowText: { fontSize: 14, color: C.text, lineHeight: 20 },
  rowTextUnread: { fontWeight: '700', color: C.rustDark },
  rowDate: { fontSize: 12, color: C.subtext, marginTop: 6 },
});
