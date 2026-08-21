// lib/reminders.js
//
// Local-only scheduled notifications -- no server-side push involved,
// just expo-notifications' on-device scheduler. Covers two independent
// features that happen to share the same infra:
//   - the daily "what made you smile today?" nudge (profiles.daily_reminder)
//   - Awareness Cue (profiles.awareness_cue_*) -- a private, contentless
//     vibrate/sound burst a few times a day at random moments within a
//     user-chosen window; see app/(tabs)/home.js for the once-per-local-
//     day regeneration hook and supabase/migrations/0042 for the schema.
//
// Imported by settings.js (handleToggleDailyReminder) and home.js (both
// reconciliation effects) — confirmed working on the dev-client build
// tested tonight. expo-notifications' native push-token module isn't
// available in Expo Go, so this requires a custom dev client rather
// than Expo Go. Also requires a global Notifications.
// setNotificationHandler() (see app/_layout.js) -- without one,
// expo-notifications silently drops any notification that fires while
// the app is in the foreground.

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

// Awareness Cue -- two channels, not one, because Android ties a
// notification's sound/vibration to the channel it was created with and
// locks that permanently at creation (can't override per-notification
// like iOS can via content.sound, and re-registering an existing
// channel with different settings is a silent no-op -- see the
// -test/-test-v2 channel-lock investigation this graduated from).
// "Vibrate" and "sound" are mutually exclusive per the spec, so each
// gets its own channel rather than one channel switching behavior at
// schedule time. Fresh, never-used ids -- not reusing -test-v2.
const AWARENESS_CUE_SOUND_CHANNEL_ID = 'awareness-cue-sound';
const AWARENESS_CUE_VIBRATE_CHANNEL_ID = 'awareness-cue-vibrate';
const AWARENESS_CUE_SOUND = 'psst.wav';
// Matches the feel-tested vibration burst from the feasibility test
// (Vibration.vibrate(400)) -- [0, 400] is [initial delay, buzz
// duration] in Android's vibration-pattern format.
const AWARENESS_CUE_VIBRATION_PATTERN = [0, 400];
// "Loose" frequency mode's count is app-decided, not user-configurable
// -- see profiles.awareness_cue_frequency_mode's column comment
// (supabase/migrations/0042).
const LOOSE_MODE_MIN_COUNT = 2;
const LOOSE_MODE_MAX_COUNT = 5;
// Fixed identifier pool sized to the largest possible daily count across
// both frequency modes (exact mode's DB-enforced max is 10 -- see 0042)
// so a full cancel-then-reschedule can always clear every slot left over
// from a previous day/config, regardless of how many were actually used
// then.
const AWARENESS_CUE_SLOT_IDS = Array.from({ length: 10 }, (_, i) => `awareness-cue-slot-${i}`);

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

async function ensureAwarenessCueChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(AWARENESS_CUE_SOUND_CHANNEL_ID, {
    name: 'Awareness Cue (sound)',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: AWARENESS_CUE_SOUND,
  });
  await Notifications.setNotificationChannelAsync(AWARENESS_CUE_VIBRATE_CHANNEL_ID, {
    name: 'Awareness Cue (vibrate)',
    importance: Notifications.AndroidImportance.DEFAULT,
    enableVibrate: true,
    vibrationPattern: AWARENESS_CUE_VIBRATION_PATTERN,
  });
}

// Builds today's local Date at a given "minutes since local midnight"
// offset (matching profiles.awareness_cue_window_start/end_minute's own
// convention) -- deliberately local time throughout, no UTC conversion,
// consistent with this app's local-day-boundary convention elsewhere
// (lib/week.js).
function dateAtLocalMinutesToday(minutesSinceMidnight) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minutesSinceMidnight);
  return date;
}

// Cancels every possible Awareness Cue slot, regardless of how many are
// actually in use right now -- safe/cheap to call whether or not
// anything is currently scheduled.
export async function cancelAwarenessCueSchedule() {
  await Promise.all(
    AWARENESS_CUE_SLOT_IDS.map((id) => Notifications.cancelScheduledNotificationAsync(id))
  );
}

// Regenerates today's random Awareness Cue schedule from scratch: clears
// every previously-scheduled slot, then schedules a fresh count of
// one-off notifications at random times within today's window. Callers
// own their own idempotency (see home.js's awareness_cue_schedule_
// generated_on-gated effect) -- calling this twice in the same day just
// re-randomizes the day's times, it isn't guarded here.
//
// The window is clamped to start no earlier than "now": generating
// purely against the configured window (e.g. 9am-9pm) regardless of
// when the app happens to be opened would place some fraction of cues
// in the already-past part of the window, where they can never fire --
// silently under-delivering the requested count for today. If "now" is
// already past the window's end, nothing is scheduled today at all
// (accepted per spec: a day the window closes before the user ever
// opens the app gets no cues that day).
export async function regenerateAwarenessCueSchedule({
  type,
  frequencyMode,
  count,
  windowStartMinute,
  windowEndMinute,
}) {
  await ensureAwarenessCueChannels();
  await cancelAwarenessCueSchedule();

  const now = new Date();
  const windowStart = dateAtLocalMinutesToday(windowStartMinute);
  const windowEnd = dateAtLocalMinutesToday(windowEndMinute);
  const effectiveStart = windowStart < now ? now : windowStart;
  if (effectiveStart >= windowEnd) return;

  const targetCount =
    frequencyMode === 'exact'
      ? count || 1
      : LOOSE_MODE_MIN_COUNT + Math.floor(Math.random() * (LOOSE_MODE_MAX_COUNT - LOOSE_MODE_MIN_COUNT + 1));
  const slotCount = Math.min(targetCount, AWARENESS_CUE_SLOT_IDS.length);

  const spanMs = windowEnd.getTime() - effectiveStart.getTime();
  const times = Array.from(
    { length: slotCount },
    () => new Date(effectiveStart.getTime() + Math.random() * spanMs)
  ).sort((a, b) => a - b);

  const channelId = type === 'sound' ? AWARENESS_CUE_SOUND_CHANNEL_ID : AWARENESS_CUE_VIBRATE_CHANNEL_ID;

  await Promise.all(
    times.map((date, i) =>
      Notifications.scheduleNotificationAsync({
        identifier: AWARENESS_CUE_SLOT_IDS[i],
        content: {
          title: 'DayTickles',
          ...(type === 'sound' ? { sound: AWARENESS_CUE_SOUND } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId,
        },
      })
    )
  );
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
