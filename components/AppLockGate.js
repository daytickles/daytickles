// components/AppLockGate.js
//
// Root-level gate — wraps the Stack in app/_layout.js, inside
// AuthProvider (needed so it can read `session` below), but still the
// first thing with any VISIBLE content: AuthProvider itself renders no
// UI, it's just context, so the lock screen (if armed) is still the
// first thing actually shown, before any route renders.
//
// The PIN gate only applies once a real session exists. Confirmed bug
// this fixes: without the `session` check, the Google Sign-In OAuth
// round-trip backgrounds/resumes the app (opening/returning from the
// browser), which used to arm the lock and fire the biometric prompt
// mid-flow, looping back to login. Gating the whole effect on `session`
// means the lock never arms while signed out — on the login screen or
// anywhere mid-OAuth, this is a pure passthrough — and only starts
// reacting to background/resume once `session` actually becomes truthy
// (a real sign-in, or a persisted session restored on cold start).
// Signing out (session -> null) also unarms it immediately, so a locked
// screen can never strand someone who just signed out.
//
// Re-checks hasPinSet() on every transition to 'background' (not
// 'inactive' — that also covers transient overlays like the iOS app
// switcher preview or share sheet, which shouldn't force a re-lock) and
// arms the lock for the next resume. If the feature was never turned on,
// hasPinSet() stays false forever and this is a no-op passthrough.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { hasPinSet } from '../lib/pinLock';
import LockScreen from './LockScreen';

export default function AppLockGate({ children }) {
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!session) {
      // Not signed in — login screen, mid-OAuth round-trip, or a cold
      // start that hasn't resolved a persisted session yet. The PIN gate
      // doesn't apply pre-session, so stay a pure passthrough.
      setLocked(false);
      setReady(true);
      return;
    }

    let mounted = true;

    // Fail-open: a rejected read (e.g. SecureStore unavailable) is
    // treated as "no PIN set" rather than leaving `ready` false forever,
    // which would otherwise strand the app on a blank screen permanently.
    hasPinSet()
      .catch(() => false)
      .then((pinSet) => {
        if (!mounted) return;
        setLocked(pinSet);
        setReady(true);
      });

    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background') {
        const pinSet = await hasPinSet().catch(() => false);
        if (mounted && pinSet) setLocked(true);
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [session]);

  if (!ready) return null;
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;
  return children;
}
