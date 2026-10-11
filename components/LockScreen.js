// components/LockScreen.js
//
// Full-screen app lock, rendered by AppLockGate whenever a PIN has been
// set and the app is locked (cold start or resume-from-background).
// Attempts biometric auth automatically once per mount, but only while the
// app is foregrounded: AppLockGate mounts this on 'background' (so content
// is hidden in the app switcher), and a prompt started then is silently
// dropped by Android and never resolves — the old stuck-spinner-on-wake
// bug. So if we mount backgrounded, the attempt waits for 'active'.
// The PIN pad is shown immediately rather than a spinner; the biometric
// sheet overlays it, and if the native call ever fails silently again
// there's still a usable PIN pad underneath. Wrong PIN just shakes out
// an error and clears the pad — no lockout/attempt-limiting, matching the
// "simple 4-digit PIN entry pad" scope this was built to.
//
// "Forgot PIN?" signs out and clears the stored PIN — safe today because
// Google Sign-In is the only entry method, so a fresh successful sign-in
// is itself a legitimate identity check. No explicit navigation needed:
// signOut() nulls `session` in AuthContext, which AppLockGate's own
// session-gated effect reacts to by unlocking (see AppLockGate.js), which
// remounts the Stack fresh at index.js — which redirects to /login on
// its own since there's no session.

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../lib/theme';
import { supabase } from '../lib/supabase';
import {
  verifyPin,
  authenticateWithBiometrics,
  cancelBiometricPrompt,
  isBiometricAvailable,
  clearPin,
} from '../lib/pinLock';
import PinPad from './PinPad';

// Wait this long after the app is active before opening the prompt, so
// Android has finished bringing the app back; a prompt opened mid-resume
// can show without responding.
const SETTLE_MS = 300;
// Leaving the app with the prompt open closes it, but not this soon after
// it opened, in case a phone briefly pauses the app as the dialog appears.
const MIN_OPEN_BEFORE_CANCEL_MS = 1000;

export default function LockScreen({ onUnlock }) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  // When the open prompt started (null = none open). Shared by the
  // automatic attempt and "Try biometrics again".
  const promptStartedAtRef = useRef(null);

  async function runPrompt() {
    promptStartedAtRef.current = Date.now();
    try {
      return await authenticateWithBiometrics();
    } finally {
      promptStartedAtRef.current = null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    // One automatic prompt per lock. Set only once it really opens, so a
    // return to the background during the settle wait still gets one.
    let started = false;

    async function attemptBiometrics() {
      const available = await isBiometricAvailable();
      if (cancelled) return;
      setBiometricAvailable(available);
      if (!available || started || AppState.currentState !== 'active') return;

      started = true;
      const success = await runPrompt();
      if (!cancelled && success) onUnlock();
    }

    function scheduleAttempt() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!cancelled && AppState.currentState === 'active') attemptBiometrics();
      }, SETTLE_MS);
    }

    // Mounted while backgrounded (device sleep / Home): the first 'active'
    // schedules the prompt. Mounted while active (cold start): schedule now.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (!started) scheduleAttempt();
      } else if (nextState === 'background') {
        clearTimeout(timer);
        timer = null;
        const openedAt = promptStartedAtRef.current;
        if (openedAt != null && Date.now() - openedAt >= MIN_OPEN_BEFORE_CANCEL_MS) {
          cancelBiometricPrompt();
        }
      }
    });
    if (AppState.currentState === 'active') scheduleAttempt();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.remove();
      if (promptStartedAtRef.current != null) cancelBiometricPrompt();
    };
    // Runs once per mount — AppLockGate remounts this screen fresh on
    // every lock (cold start / resume), which is exactly when a new
    // biometric attempt should fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePinComplete(pin) {
    const correct = await verifyPin(pin);
    if (correct) {
      setError('');
      onUnlock();
    } else {
      setError('Incorrect PIN, try again.');
    }
  }

  // A tap while a prompt is already open just waits on that one (see
  // authenticateWithBiometrics), so it can't stack a second dialog.
  async function retryBiometrics() {
    if (AppState.currentState !== 'active') return;
    setError('');
    const success = await runPrompt();
    if (success) onUnlock();
  }

  async function handleForgotPin() {
    setSigningOut(true);
    await clearPin();
    await supabase.auth.signOut();
    // No further action here — AppLockGate unlocks itself once `session`
    // goes null, so this component unmounts on its own.
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>
        <PinPad
          title="Enter your PIN"
          error={error}
          onComplete={signingOut ? () => {} : handlePinComplete}
        />
        {biometricAvailable && (
          <TouchableOpacity onPress={retryBiometrics} style={styles.biometricRetry} disabled={signingOut}>
            <Text style={styles.biometricRetryText}>Try biometrics again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleForgotPin} style={styles.forgotPin} disabled={signingOut}>
          <Text style={styles.forgotPinText}>
            {signingOut ? 'Signing out...' : 'Forgot PIN?'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  biometricRetry: { marginTop: 24 },
  biometricRetryText: { fontSize: 14, color: C.rust, fontWeight: '600' },
  forgotPin: { marginTop: 20 },
  forgotPinText: { fontSize: 13, color: C.subtext, fontWeight: '600' },
});
