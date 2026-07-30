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

import { Platform, Alert } from 'react-native';
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

// Fires a one-off notification a few seconds out through the same
// channel/content path as the real daily reminders, so display can be
// tested on demand without waiting for the 8am/8pm trigger. Uses no
// identifier so it can't collide with or cancel the real scheduled
// reminders.
export async function sendTestReminderNotification() {
  // Unique identifier + timestamped body so repeat test sends can't get
  // collapsed by Android/OEM notification deduplication (some dedupe on
  // matching title+body, which a fixed test string would trigger).
  const stamp = new Date().toLocaleTimeString();
  const identifier = `test-reminder-${Date.now()}`;
  // try/catch + Alert scoped to this TEMP TEST function only — surfaces
  // whether scheduleNotificationAsync itself succeeds (returned id) or
  // throws on repeat calls, instead of inferring it from OS notification
  // history. Not present on scheduleDailyReminder (production path).
  try {
    await ensureAndroidChannel();
    const returnedId = await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'DayTickles (test)',
        body: `Test reminder sent at ${stamp} — if this pops up, local notification display is working.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
    Alert.alert('Test notification scheduled', `scheduleNotificationAsync returned id:\n${returnedId}`);
  } catch (err) {
    Alert.alert('Test notification FAILED', String(err?.message || err));
  }
}

export async function cancelDailyReminder() {
  await Notifications.cancelScheduledNotificationAsync(LEGACY_REMINDER_ID);
  await Notifications.cancelScheduledNotificationAsync(MORNING_REMINDER_ID);
  await Notifications.cancelScheduledNotificationAsync(EVENING_REMINDER_ID);
}
