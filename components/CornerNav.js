import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { C } from '../lib/theme';
import { useNotifications } from '../contexts/NotificationsContext';
import { useAuth } from '../contexts/AuthContext';
import CountBadge from './CountBadge';

// Shared Calendar / Weekly Summary / Notifications / Founding Member /
// Settings row, rendered identically at the top of the tab screens (Home,
// Tickle Stash, Tickle Pics, Calendar) and the Routines and Reminders
// page. These used to live only in Home's own header row; now that the
// other screens are peer tabs rather than screens only reached via Home,
// they need to be reachable from all of them. Calendar is no longer in
// the bottom bar, so its icon here is the way in; it isn't shown on the
// Calendar screen itself. The token balance that used to lead this row
// now shows only in Home's "Your Rewards - you can redeem" header.
export default function CornerNav({ style }) {
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const { profile, refreshProfile } = useAuth();
  const onCalendar = usePathname() === '/calendar';

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
  // not just Home's -- so the badge stays current regardless of
  // which tab is active, without polling or a Realtime subscription.
  // refreshProfile() here is also this app's Settings-toggle
  // reconciliation point (see project memory: tickle-nature-toggle-bug)
  // -- several Settings fields (notify_on_likes, daily_reminder,
  // day_journal_enabled, tokens_enabled, etc.) are intentionally
  // local-state-only in their own handlers to avoid a proven Home-bounce
  // bug, and rely on a focus-triggered refreshProfile() somewhere to
  // catch the shared profile back up. This used to live only in Home's
  // own useFocusEffect; consolidated here since CornerNav is the one
  // component actually mounted on every tab, closing the previously
  // -accepted gap where reaching Settings from Feed/Calendar/Pinboard
  // directly (not via Home) left the shared profile stale until the
  // next Home visit.
  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount();
      refreshProfile();
    }, [refreshUnreadCount, refreshProfile])
  );

  return (
    <View style={[styles.row, style]}>
      {!onCalendar && (
        <TouchableOpacity
          onPress={() => router.navigate('/calendar')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Calendar"
        >
          <Ionicons name="calendar-outline" size={20} color={C.subtext} />
        </TouchableOpacity>
      )}
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
