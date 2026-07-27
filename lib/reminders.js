// lib/reminders.js
//
// Local-only scheduled notifications for the daily "what made you smile
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

// Fixed identifiers, one per slot, so re-scheduling (e.g. toggling off/on,
// or a future re-sync on app boot) always replaces the same entries rather
// than stacking duplicate daily notifications.
const MORNING_REMINDER_ID = 'daily-reminder-morning';
const EVENING_REMINDER_ID = 'daily-reminder-evening';
// Superseded single-reminder identifier from before the morning/evening
// split. Anyone who had it scheduled needs it explicitly cancelled —
// it's a different id from either new one, so neither's cancel-then-
// schedule call touches it on its own.
const LEGACY_REMINDER_ID = 'daily-reminder';
const MORNING_HOUR = 8;
const MORNING_MINUTE = 0;
const EVENING_HOUR = 20;
const EVENING_MINUTE = 0;
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

// Cancels any previously-scheduled reminders before scheduling the new
// ones, so this is always safe to call again without stacking duplicates.
export async function scheduleDailyReminder() {
  await ensureAndroidChannel();

  await Notifications.cancelScheduledNotificationAsync(LEGACY_REMINDER_ID);

  await Notifications.cancelScheduledNotificationAsync(MORNING_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: MORNING_REMINDER_ID,
    content: {
      title: 'DayTickles',
      body: 'Good morning, remember to get Tickled today!',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: MORNING_HOUR,
      minute: MORNING_MINUTE,
      channelId: ANDROID_CHANNEL_ID,
    },
  });

  await Notifications.cancelScheduledNotificationAsync(EVENING_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: EVENING_REMINDER_ID,
    content: {
      title: 'DayTickles',
      body: "Good evening, don't forget to journal today's little joys.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: EVENING_HOUR,
      minute: EVENING_MINUTE,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

export async function cancelDailyReminder() {
  await Notifications.cancelScheduledNotificationAsync(LEGACY_REMINDER_ID);
  await Notifications.cancelScheduledNotificationAsync(MORNING_REMINDER_ID);
  await Notifications.cancelScheduledNotificationAsync(EVENING_REMINDER_ID);
}
