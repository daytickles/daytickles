// components/LockScreen.js
//
// Full-screen app lock, rendered by AppLockGate whenever a PIN has been
// set and the app is locked (cold start or resume-from-background).
// Attempts biometric auth automatically once on mount; any failure or
// unavailability falls through to the PIN pad. Wrong PIN just shakes out
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

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { verifyPin, authenticateWithBiometrics, isBiometricAvailable, clearPin } from '../lib/pinLock';
import PinPad from './PinPad';

export default function LockScreen({ onUnlock }) {
  const [checkingBiometrics, setCheckingBiometrics] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const available = await isBiometricAvailable();
      if (cancelled) return;
      setBiometricAvailable(available);

      if (available) {
        const success = await authenticateWithBiometrics();
        if (cancelled) return;
        if (success) {
          onUnlock();
          return;
        }
      }
      setCheckingBiometrics(false);
    })();

    return () => {
      cancelled = true;
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

  async function retryBiometrics() {
    setError('');
    setCheckingBiometrics(true);
    const success = await authenticateWithBiometrics();
    if (success) {
      onUnlock();
    } else {
      setCheckingBiometrics(false);
    }
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
      {checkingBiometrics ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.rust} size="large" />
        </View>
      ) : (
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
      )}
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
