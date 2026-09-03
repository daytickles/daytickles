import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { C } from '../lib/theme';
import { useNotifications } from '../contexts/NotificationsContext';
import { useAuth } from '../contexts/AuthContext';
import CountBadge from './CountBadge';

// Shared Weekly Summary / Notifications / Settings row, rendered
// identically at the top of each of the four tab screens (Home, Tickle Stash,
// Calendar, Tickle Pics). These three used to live only in Home's own
// header row; now that Tickle Stash/Calendar/Tickle Pics are peer tabs rather
// than screens only reached via Home, they need to be reachable from
// all four.
export default function CornerNav({ style }) {
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const { profile } = useAuth();

  // "Taking part" off just stops surfacing the icon (progress keeps
  // counting underneath -- see lib/foundingMember.js); the failure-seen
  // flag hides it for good after the one-time closing message has been
  // shown, per the spec's "the FM page and its nav icon quietly
  // disappear" on non-recoverable failure. Defaults to shown (both
  // profile fields default true/false respectively) for anyone whose
  // profile hasn't loaded yet, matching "visible to all users by
  // default."
  const showFoundingMember =
    profile?.founding_member_taking_part !== false && !profile?.founding_member_failure_message_seen;

  // Refetches on every focus of whichever tab hosts this component --
  // not just Home's -- so the badge stays current regardless of which
  // tab is active, without polling or a Realtime subscription.
  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount();
    }, [refreshUnreadCount])
  );

  return (
    <View style={[styles.row, style]}>
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
        <CountBadge count={unreadCount} />
      </TouchableOpacity>
      {showFoundingMember && (
        <TouchableOpacity
          onPress={() => router.push('/founding-member')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="crown-outline" size={20} color={C.subtext} />
        </TouchableOpacity>
      )}
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
  settingsLink: { fontSize: 22, color: C.subtext },
});
