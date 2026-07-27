// lib/pinLock.js
//
// Local-only app-lock PIN, backed by SecureStore (OS Keychain/Keystore) —
// never touches Supabase or any other storage. Opt-in: if no PIN has ever
// been set, the feature is fully inert (see components/AppLockGate.js,
// which skips the lock screen entirely when hasPinSet() resolves false).

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const PIN_KEY = 'daytickles-app-lock-pin';

export async function hasPinSet() {
  const pin = await SecureStore.getItemAsync(PIN_KEY);
  return !!pin;
}

export async function savePin(pin) {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function verifyPin(pin) {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored != null && stored === pin;
}

export async function clearPin() {
  await SecureStore.deleteItemAsync(PIN_KEY);
}

export async function isBiometricAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

// Resolves true only on an actual successful biometric match — every
// other outcome (no hardware, nothing enrolled, user cancel, lockout,
// error) resolves false so the caller can fall straight through to the
// PIN pad without needing to inspect a result shape.
export async function authenticateWithBiometrics() {
  const available = await isBiometricAvailable();
  if (!available) return false;

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock DayTickles',
      disableDeviceFallback: true,
      cancelLabel: 'Use PIN',
    });
    return !!result.success;
  } catch {
    return false;
  }
}
