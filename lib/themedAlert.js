// lib/themedAlert.js
//
// Imperative entry point for the app's themed alert -- the one popup look
// every alert uses (see components/ThemedAlertHost.js, mounted once at
// the root in app/_layout.js). Same call shape as React Native's
// Alert.alert(title, message, buttons), so a call site migrates by
// swapping the function, including plain modules like lib/freemiumCaps.js
// that can't render JSX themselves.
//
// Buttons are the same { text, style, onPress } objects Alert.alert takes;
// style is 'cancel', 'destructive', or omitted. There's deliberately no
// options argument: every themed alert is button-only (no backdrop tap,
// no Android back button), matching the native Android default this
// replaces.

import { Alert } from 'react-native';

let enqueue = null;

// Called by ThemedAlertHost on mount; returns its own unregister.
export function registerAlertHost(fn) {
  enqueue = fn;
  return () => {
    if (enqueue === fn) enqueue = null;
  };
}

export function showAlert(title, message, buttons) {
  const resolved = buttons && buttons.length ? buttons : [{ text: 'OK' }];
  if (!enqueue) {
    // No host mounted -- only possible while AppLockGate is showing the
    // lock screen (it unmounts everything under it, host included). Fall
    // back to the native alert rather than silently dropping the message.
    Alert.alert(title, message, resolved);
    return;
  }
  enqueue({ title, message, buttons: resolved });
}

// One shared message for an optimistic change the server rejected, after
// the caller has already put the screen back the way it was. Throttled to
// once per 3 seconds, so a burst of failures (e.g. while offline) shows
// one popup rather than a queue of them.
const SAVE_FAILED_THROTTLE_MS = 3000;
let lastSaveFailedAt = 0;

export function showSaveFailed() {
  const now = Date.now();
  if (now - lastSaveFailedAt < SAVE_FAILED_THROTTLE_MS) return;
  lastSaveFailedAt = now;
  showAlert("Couldn't save that", 'Please try again.');
}
