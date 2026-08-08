import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { C } from '../lib/theme';
import { useNotifications } from '../contexts/NotificationsContext';

// Shared Weekly Summary / Notifications / Settings row, rendered
// identically at the top of each of the four tab screens (Home, Feed,
// Calendar, Tickle Pics). These three used to live only in Home's own
// header row; now that Feed/Calendar/Tickle Pics are peer tabs rather
// than screens only reached via Home, they need to be reachable from
// all four.
export default function CornerNav() {
  const { unreadCount, refreshUnreadCount } = useNotifications();

  // Refetches on every focus of whichever tab hosts this component --
  // not just Home's -- so the badge stays current regardless of which
  // tab is active, without polling or a Realtime subscription.
  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount();
    }, [refreshUnreadCount])
  );

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => router.push('/weekly-summary')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="stats-chart-outline" size={20} color={C.subtext} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push('/notifications')}
        style={styles.bellButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="notifications-outline" size={20} color={C.subtext} />
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push('/settings')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.settingsLink}>⚙</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 12,
  },
  bellButton: { position: 'relative' },
  unreadBadge: {
    position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  unreadBadgeText: { fontSize: 10, fontWeight: '700', color: C.bg },
  settingsLink: { fontSize: 22, color: C.subtext },
});
