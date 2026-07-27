// components/AppLockGate.js
//
// Root-level gate — wraps the whole app in app/_layout.js, outside
// AuthProvider, so the lock screen (if a PIN is set) is the very first
// thing rendered, before any auth/session logic runs. Renders nothing
// else until the initial hasPinSet() check resolves, so real content
// never flashes ahead of the lock decision.
//
// Re-checks hasPinSet() on every transition to 'background' (not
// 'inactive' — that also covers transient overlays like the iOS app
// switcher preview or share sheet, which shouldn't force a re-lock) and
// arms the lock for the next resume. If the feature was never turned on,
// hasPinSet() stays false forever and this is a no-op passthrough.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { hasPinSet } from '../lib/pinLock';
import LockScreen from './LockScreen';

export default function AppLockGate({ children }) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
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
  }, []);

  if (!ready) return null;
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;
  return children;
}
