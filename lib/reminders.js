// lib/reminders.js
//
// Local-only scheduled notification for the daily "what made you smile
// today?" nudge — no server-side push involved, just expo-notifications'
// on-device scheduler. Wires up profiles.daily_reminder, which existed
// in the schema unused until now.
//
// Imported by settings.js (handleToggleDailyReminder) — confirmed working
// on the dev-client build tested today. expo-notifications' native
// push-token module isn't available in Expo Go, so this requires a custom
// dev client rather than Expo Go.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Fixed identifier so re-scheduling (e.g. toggling off/on, or a future
// re-sync on app boot) always replaces the same entry rather than
// stacking duplicate daily notifications.
const DAILY_REMINDER_ID = 'daily-reminder';
const REMINDER_HOUR = 20;
const REMINDER_MINUTE = 0;
const ANDROID_CHANNEL_ID = 'default';

export async function getReminderPermissionGranted() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// Only prompts if permission hasn't already been granted — avoids an
// unnecessary re-prompt (which iOS/Android wouldn't show again after an
// initial decision anyway) on every toggle-on.
export async function requestReminderPermission() {
  const alreadyGranted = await getReminderPermissionGranted();
  if (alreadyGranted) return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// Cancels any previously-scheduled reminder before scheduling the new
// one, so this is always safe to call again without stacking duplicates.
export async function scheduleDailyReminder() {
  await ensureAndroidChannel();
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: 'DayTickles',
      // Reuses create.js's own prompt rather than inventing new wording.
      body: 'What made you smile today?',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

export async function cancelDailyReminder() {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
}
