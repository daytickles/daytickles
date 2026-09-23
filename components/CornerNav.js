import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { C } from '../lib/theme';
import { useNotifications } from '../contexts/NotificationsContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchTokenBalance, fetchCheapestWishlistCost } from '../lib/tokens';
import CountBadge from './CountBadge';

// Shared Weekly Summary / Notifications / Founding Member / Tokens /
// Settings row, rendered identically at the top of each of the four tab
// screens (Home, Tickle Stash, Calendar, Tickle Pics). These used to
// live only in Home's own header row; now that Tickle Stash/Calendar/
// Tickle Pics are peer tabs rather than screens only reached via Home,
// they need to be reachable from all four.
export default function CornerNav({ style }) {
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const { profile, refreshProfile } = useAuth();
  const [tokenBalance, setTokenBalance] = useState(0);
  const [cheapestWishlistCost, setCheapestWishlistCost] = useState(null);

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

  // Master on/off, independent of any per-Goal earns_tokens toggle --
  // off hides the circle entirely regardless of balance. Defaults shown,
  // same "!== false" idiom as showFoundingMember above.
  const showTokens = profile?.tokens_enabled !== false;

  // Refetches on every focus of whichever tab hosts this component --
  // not just Home's -- so the badge/balance stay current regardless of
  // which tab is active, without polling or a Realtime subscription.
  // refreshProfile() here is also this app's Settings-toggle
  // reconciliation point (see project memory: tickle-nature-toggle-bug)
  // -- several Settings fields (notify_on_likes, daily_reminder,
  // day_journal_enabled, tokens_enabled, etc.) are intentionally
  // local-state-only in their own handlers to avoid a proven Home-bounce
  // bug, and rely on a focus-triggered refreshProfile() somewhere to
  // catch the shared profile back up. This used to live only in Home's
  // own useFocusEffect; consolidated here since CornerNav is the one
  // component actually mounted on all four tabs, closing the previously
  // -accepted gap where reaching Settings from Feed/Calendar/Pinboard
  // directly (not via Home) left the shared profile stale until the
  // next Home visit.
  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount();
      refreshProfile();
    }, [refreshUnreadCount, refreshProfile])
  );

  useFocusEffect(
    useCallback(() => {
      if (!showTokens) return;
      fetchTokenBalance().then(setTokenBalance).catch(() => {});
      fetchCheapestWishlistCost().then(setCheapestWishlistCost).catch(() => {});
    }, [showTokens])
  );

  const canRedeemCheapest = cheapestWishlistCost != null && tokenBalance >= cheapestWishlistCost;

  return (
    <View style={[styles.row, style]}>
      {showTokens && (
        <TouchableOpacity
          onPress={() => router.push('/wishlist')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={[styles.tokenCircle, canRedeemCheapest && styles.tokenCircleFilled]}>
            <Text style={[styles.tokenCircleText, canRedeemCheapest && styles.tokenCircleTextFilled]}>
              {tokenBalance}
            </Text>
          </View>
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
  tokenCircle: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.subtext,
  },
  tokenCircleFilled: { backgroundColor: C.subtext, borderColor: C.subtext },
  tokenCircleText: { fontSize: 11, fontWeight: '700', color: C.subtext },
  tokenCircleTextFilled: { color: C.card },
});
