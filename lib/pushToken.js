// lib/pushToken.js
//
// Registers this device's Expo push token against the signed-in user's
// profile so a future push backend (e.g. for profiles.notify_on_likes)
// has somewhere to send to. Called from AuthContext on sign-in and on
// app launch while already signed in. Fire-and-forget from the caller's
// side and fails silently throughout — push registration is a best-
// effort background step (simulators, Expo Go, and denied permission
// all legitimately have no token to save) and must never block auth.

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

const EAS_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId;

async function ensurePermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;

  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === 'granted';
}

export async function registerPushToken(userId) {
  if (!userId) return;

  try {
    const granted = await ensurePermission();
    if (!granted) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    if (!token) return;

    await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  } catch (error) {
    // Expected on simulators/emulators (no push capability) and in Expo
    // Go (the native push-token module isn't available there, same
    // caveat as lib/reminders.js) — nothing to recover, just skip.
    console.log('registerPushToken skipped:', error.message);
  }
}
