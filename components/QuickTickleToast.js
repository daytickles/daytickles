import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, AccessibilityInfo } from 'react-native';
import { C } from '../lib/theme';

// How long the toast stays up when no screen reader is on. With TalkBack
// on it doesn't hide by itself (WCAG 2.2.1) -- it closes on Undo, Tickle
// it, the next Quick Tickle, or leaving Home.
const AUTO_HIDE_MS = 6000;

// Home's "Logged to <Vibe>" toast after a Quick Tickle. toast is
// { id, label } or null; a new id restarts it. Core Animated only. The
// caller owns the state and returns focus to its dot button on close.
// message (optional) replaces the "Logged to <label>" wording, e.g. for a
// Quick Note from Nudges & Notes ("Logged to <Vibe>. +1 token").
export default function QuickTickleToast({ toast, message: messageProp, onUndo, onTickleIt, onTimeout, style }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const undoRef = useRef(null);
  // Latest onTimeout without restarting the timer on every Home render.
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const toastId = toast?.id;
  const message = toast ? (messageProp || `Logged to ${toast.label}`) : '';

  useEffect(() => {
    if (!toastId) return undefined;
    let cancelled = false;
    let timer = null;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility(message);
    // After the announcement has started, so TalkBack lands on Undo.
    const focusTimer = setTimeout(() => {
      if (!cancelled && undoRef.current) AccessibilityInfo.sendAccessibilityEvent(undoRef.current, 'focus');
    }, 400);
    AccessibilityInfo.isScreenReaderEnabled()
      .catch(() => false)
      .then((screenReaderOn) => {
        if (cancelled || screenReaderOn) return;
        timer = setTimeout(() => onTimeoutRef.current?.(), AUTO_HIDE_MS);
      });
    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
      if (timer) clearTimeout(timer);
    };
  }, [toastId]);

  if (!toast) return null;

  return (
    <Animated.View style={[styles.toast, { opacity }, style]} accessibilityLiveRegion="polite">
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
      <TouchableOpacity
        ref={undoRef}
        onPress={onUndo}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="Undo"
      >
        <Text style={styles.actionText}>Undo</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onTickleIt}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="Tickle it"
      >
        <Text style={styles.actionText}>Tickle it</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Same dark C.rustDark / light C.bg pairing as Home's stat tooltips.
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.rustDark, borderRadius: 16,
    paddingVertical: 4, paddingLeft: 16, paddingRight: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  message: { flex: 1, fontSize: 14, fontWeight: '600', color: C.bg },
  // 44dp tall tap targets inside the toast.
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  actionText: { fontSize: 14, fontWeight: '700', color: C.bg },
});
