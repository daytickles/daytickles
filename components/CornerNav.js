import { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { C, accentFor, darken } from '../lib/theme';
import { useNotifications } from '../contexts/NotificationsContext';
import { useAuth } from '../contexts/AuthContext';
import CountBadge from './CountBadge';

// The top-bar icons are 20dp with 16dp between them: 12 above and below
// makes them 44dp tall to tap; the sides stay at 8 (half the gap), so
// neighbouring icons' tap areas meet without overlapping.
const TOP_BAR_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

// Shared Calendar / Weekly Summary / Notifications / Founding Member /
// Settings row, rendered identically at the top of the tab screens (Home,
// Tickle Stash, Tickle Pics, Calendar) and the Routines and Reminders
// page. These used to live only in Home's own header row; now that the
// other screens are peer tabs rather than screens only reached via Home,
// they need to be reachable from all of them. Calendar is no longer in
// the bottom bar, so its icon here is the way in. Every destination here
// is a hidden tab, so this row and the bottom bar stay on screen; the
// icon for the screen you are on is shown in the accent colour (selected)
// and does nothing when tapped. The token balance that used to lead this
// row now shows only in Home's "Your Rewards - you can redeem" header.
export default function CornerNav({ style }) {
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const { profile, refreshProfile } = useAuth();
  const pathname = usePathname();
  // The darker accent shade the app uses for accent-coloured controls on
  // cream (3.9-4.7:1 across the five themes; the raw accents are ~2:1).
  const activeColor = darken(accentFor(profile?.accent_theme).card, 0.35);
  const colorFor = (route) => (pathname === route ? activeColor : C.subtext);
  // Selected icon: no navigation and no press fade; spoken as selected.
  const go = (route) => (pathname === route ? undefined : () => router.navigate(route));
  const pressProps = (route) => ({
    onPress: go(route),
    activeOpacity: pathname === route ? 1 : 0.2,
    accessibilityRole: 'button',
    accessibilityState: { selected: pathname === route },
  });

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
      <TouchableOpacity
        {...pressProps('/calendar')}
        hitSlop={TOP_BAR_HIT_SLOP}
        accessibilityLabel="Calendar"
      >
        <Ionicons name="calendar-outline" size={20} color={colorFor('/calendar')} />
      </TouchableOpacity>
      <TouchableOpacity
        {...pressProps('/weekly-summary')}
        hitSlop={TOP_BAR_HIT_SLOP}
        accessibilityLabel="Weekly Summary"
      >
        <Ionicons name="stats-chart-outline" size={20} color={colorFor('/weekly-summary')} />
      </TouchableOpacity>
      <TouchableOpacity
        {...pressProps('/notifications')}
        style={styles.bellButton}
        hitSlop={TOP_BAR_HIT_SLOP}
        accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Ionicons name="notifications-outline" size={20} color={colorFor('/notifications')} />
        <CountBadge count={unreadCount} />
      </TouchableOpacity>
      {showFoundingMember && (
        <TouchableOpacity
          {...pressProps('/founding-member')}
          hitSlop={TOP_BAR_HIT_SLOP}
          accessibilityLabel="Moji Quest"
        >
          <MaterialCommunityIcons name="crown-outline" size={20} color={colorFor('/founding-member')} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        {...pressProps('/settings')}
        hitSlop={TOP_BAR_HIT_SLOP}
        accessibilityLabel="Settings"
      >
        <Text style={[styles.settingsLink, { color: colorFor('/settings') }]}>⚙</Text>
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
