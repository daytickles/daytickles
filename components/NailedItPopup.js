// components/NailedItPopup.js
//
// "Nailed it!": opened from the QG button on Home's Your Goals card.
// Lists the user's active Goals that earn tokens; tapping one saves a
// goal_logs row (lib/goalLogs.js), and the database trigger adds +1
// token. No Tickle is written, there is no limit and no Undo. The popup
// stays open so more Goals (or the same one again) can be tapped. With
// no token-earning Goal, an empty state points to Your Goals.
//
// Positioning: a Modal (its own window, so TalkBack stays inside it) made
// to fill the whole window with statusBarTranslucent +
// navigationBarTranslucent, as QuickTicklePopover does. The panel sits
// 12dp from the left and right safe edges and 12dp above the tab bar
// (bottomOffset, from the caller's useBottomTabBarHeight, which already
// includes the bottom inset). Its height is capped to the room above
// that, below the top safe edge; the Goal list scrolls inside it when it
// doesn't fit, so nothing is clipped at a large font scale.
//
// The balance line is fetched here (fetchTokenBalance) when the popup
// opens and after each tap -- not taken from Home, which only loads it
// while My Rewards is showing. If the fetch fails the line is hidden.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, AccessibilityInfo, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveGoalLog } from '../lib/goalLogs';
import { fetchTokenBalance } from '../lib/tokens';
import { showAlert } from '../lib/themedAlert';

const PANEL_FILL = '#FFFDF7';
const PANEL_LINE = '#EADFCB';
const INK = '#4A1F10';
const HELPER = '#5F5B52';
const DONE_INK = '#6B675E';
const ROW_LINE = '#E8DCC8';
const PILL_FILL = '#F3E8D6';
const ADDED_EDGE = '#4B5A40';
const ADDED_FILL = '#E7EDE1';
const CREAM = '#FFF8EC';
const DUSK = '#425762';
const SIDE = 12;
const GAP_ABOVE_TAB_BAR = 12;
const TOP_EDGE = 12;
const CLOSE_SIZE = 44;

export default function NailedItPopup({ visible, goals, userId, bottomOffset = 0, onClose, onOpenGoals, onTokenAwarded }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Balance for the line under the rows; null hides it (not loaded or failed).
  const [balance, setBalance] = useState(null);
  // The row that last gave a token: it keeps the "added" look.
  const [lastAddedId, setLastAddedId] = useState(null);
  // Goal ids with a save in flight: that row ignores taps until it ends.
  const inFlight = useRef(new Set());
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  async function refreshBalance() {
    try {
      const value = await fetchTokenBalance();
      if (mounted.current) setBalance(value);
    } catch {
      if (mounted.current) setBalance(null);
    }
  }

  // Each time it opens: a fresh balance and no "added" row.
  useEffect(() => {
    if (!visible) return;
    setLastAddedId(null);
    setBalance(null);
    refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function handleTap(goal) {
    if (!userId || inFlight.current.has(goal.id)) return;
    inFlight.current.add(goal.id);
    const { error } = await saveGoalLog(userId, goal.id);
    inFlight.current.delete(goal.id);
    if (!mounted.current) return;
    if (error) {
      console.warn('NailedItPopup: save failed', error?.code || error?.message || error);
      showAlert("Couldn't save that. Please try again.");
      return;
    }
    setLastAddedId(goal.id);
    AccessibilityInfo.announceForAccessibility(`+1 token for ${goal.label}`);
    refreshBalance();
    onTokenAwarded?.();
  }

  const list = goals || [];
  const bottom = bottomOffset + GAP_ABOVE_TAB_BAR;
  const maxHeight = Math.max(200, windowHeight - bottom - insets.top - TOP_EDGE);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Nailed it!"
        />
        <View
          style={[
            styles.panel,
            { left: insets.left + SIDE, right: insets.right + SIDE, bottom, maxHeight },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title} accessibilityRole="header">Nailed it!</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={INK} />
            </TouchableOpacity>
          </View>

          {list.length > 0 ? (
            <>
              <Text style={styles.helper}>Did something toward a Goal? Tap it for 1 token. No Tickle needed.</Text>
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {list.map((goal) => {
                  const added = lastAddedId === goal.id;
                  return (
                    <TouchableOpacity
                      key={goal.id}
                      style={[styles.row, added && styles.rowAdded]}
                      onPress={() => handleTap(goal)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`${goal.label}, plus 1 token`}
                    >
                      <View style={[styles.goalDot, { backgroundColor: goal.color }]} />
                      <Text style={styles.goalName} numberOfLines={1} ellipsizeMode="tail">{goal.label}</Text>
                      <View style={[styles.pill, added && styles.pillAdded]}>
                        <Text style={[styles.pillText, added && styles.pillTextAdded]}>
                          {added ? '+1 added' : '+1 token'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {balance != null && (
                <Text style={styles.balance}>
                  {`You have ${balance} token${balance === 1 ? '' : 's'}`}
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.empty}>
                None of your Goals earns tokens yet. Turn on the coin for a Goal and it will show here.
              </Text>
              <TouchableOpacity
                style={styles.openGoals}
                onPress={onOpenGoals}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.openGoalsText}>Open Your Goals</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.done} onPress={onClose} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The same dim as the Quick Tickle pop-up.
  backdrop: { flex: 1, backgroundColor: 'rgba(44,44,42,0.4)' },
  // Soft warm shadow, like the Quick Tickle pop-up: the shadow* keys are
  // iOS; Android uses elevation only.
  panel: {
    position: 'absolute',
    backgroundColor: PANEL_FILL, borderWidth: 1, borderColor: PANEL_LINE, borderRadius: 26,
    paddingTop: 16, paddingRight: 16, paddingBottom: 8, paddingLeft: 16,
    shadowColor: '#4A1F10', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontSize: 20, fontWeight: '700', color: INK },
  close: {
    width: CLOSE_SIZE, height: CLOSE_SIZE, marginRight: -10, marginVertical: -8,
    alignItems: 'center', justifyContent: 'center',
  },
  helper: { marginTop: 4, marginBottom: 12, fontSize: 14, color: HELPER },
  // Grows to its rows, shrinks and scrolls when the panel hits maxHeight.
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 56, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 18, borderWidth: 1.5, borderColor: ROW_LINE, backgroundColor: PANEL_FILL,
  },
  rowAdded: { borderColor: ADDED_EDGE, backgroundColor: ADDED_FILL },
  goalDot: { width: 14, height: 14, borderRadius: 7 },
  goalName: { flex: 1, fontSize: 17, fontWeight: '600', color: INK },
  pill: {
    minHeight: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center',
    backgroundColor: PILL_FILL,
  },
  pillAdded: { backgroundColor: ADDED_EDGE },
  pillText: { fontSize: 14, fontWeight: '700', color: INK },
  pillTextAdded: { color: CREAM },
  balance: { marginTop: 12, fontSize: 14, color: HELPER, textAlign: 'center' },
  empty: { marginTop: 4, marginBottom: 14, fontSize: 15, lineHeight: 21, color: INK },
  openGoals: {
    minHeight: 52, borderRadius: 26, backgroundColor: DUSK,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  openGoalsText: { fontSize: 16, fontWeight: '700', color: CREAM, textAlign: 'center' },
  done: { minHeight: 44, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 15, fontWeight: '600', color: DONE_INK },
});
