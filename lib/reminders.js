// lib/reminders.js
//
// Local-only scheduled notifications -- no server-side push involved,
// just expo-notifications' on-device scheduler. Covers two independent
// features that happen to share the same infra:
//   - the daily "what made you smile today?" nudge (profiles.daily_reminder)
//   - Awareness Cue (profiles.awareness_cue_*) -- a private, contentless
//     vibrate/sound burst a few times a day at random moments within a
//     user-chosen window, generated in multi-day batches (see the
//     redesign, 2026-08-22) rather than daily; see app/(tabs)/home.js
//     for the batch-expiry regeneration hook and supabase/migrations/
//     0042 + 0046 for the schema.
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
import { localDateString } from './week';

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
// Exported -- Day Dots' currentDayDotsPromptDate below needs the exact
// same cutoff the real evening reminder fires at, not a second
// independently-maintained copy of the hour/minute that could drift
// out of sync with this file's own scheduleDailyReminder.
export const EVENING_HOUR = 20;
export const EVENING_MINUTE = 0;
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
// Bumped to -v2: the original 'awareness-cue-vibrate' channel was
// created on-device without an explicit `sound` key at all, which
// skips channel.setSound() entirely on the native side (see
// AndroidXNotificationsChannelManager.java) rather than silencing it --
// Android's own NotificationChannel then defaults to the system sound.
// Same channel-lock rule as -test/-test-v2: re-registering the same id
// with sound: null now added below can't fix an already-created
// channel, only a fresh id forces a clean create.
const AWARENESS_CUE_VIBRATE_CHANNEL_ID = 'awareness-cue-vibrate-v2';
// Fallback for devices where the custom sound is confirmed (via the
// "Did you hear it?" prompt in Settings) not to actually play, despite
// psst.wav being correctly configured -- a real, unresolved ColorOS-
// specific gap found 2026-08-22 (see backlog), not a code bug. `sound`
// is deliberately omitted entirely below, not set to null -- same
// mechanism that (accidentally) gave the original vibrate channel the
// system default sound, reused here on purpose.
const AWARENESS_CUE_SOUND_DEFAULT_CHANNEL_ID = 'awareness-cue-sound-default';
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
// Matches profiles.awareness_cue_count's DB-enforced max (0042).
const AWARENESS_CUE_MAX_DAILY_COUNT = 10;
// A single generation now covers this many local calendar days at once
// (today + the days after it) rather than regenerating every day --
// see the multi-day batch redesign, 2026-08-22. 2 is a working default,
// not derived from anything else; tune here if it ever changes.
const AWARENESS_CUE_BATCH_DAYS = 2;
// Hard floor under the today's-count scaling below: no matter how a
// day's count is derived, two same-day cues can never land closer
// together than this -- covers an unlucky cluster of independent
// random draws that the count/window math alone doesn't prevent. See
// enforceMinimumGap.
const AWARENESS_CUE_MIN_GAP_MS = 15 * 60 * 1000;
// Below this much remaining time in today's window (only relevant when
// today's start got clamped to "now" -- see regenerateAwarenessCueSchedule),
// skip today entirely rather than force at least one cue into a sliver
// too small to feel natural.
const AWARENESS_CUE_MIN_REMAINING_MS_TO_SCHEDULE = 15 * 60 * 1000;
// Fixed identifier pool sized to the largest possible count across the
// whole batch (days x per-day max) so a full cancel-then-reschedule can
// always clear every slot left over from a previous batch/config,
// regardless of how many were actually used then. Derived, not a
// second hardcoded number, so it can't drift out of sync with the two
// constants above.
const AWARENESS_CUE_SLOT_IDS = Array.from(
  { length: AWARENESS_CUE_BATCH_DAYS * AWARENESS_CUE_MAX_DAILY_COUNT },
  (_, i) => `awareness-cue-slot-${i}`
);

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
    sound: null,
    enableVibrate: true,
    vibrationPattern: AWARENESS_CUE_VIBRATION_PATTERN,
  });
  await Notifications.setNotificationChannelAsync(AWARENESS_CUE_SOUND_DEFAULT_CHANNEL_ID, {
    name: 'Awareness Cue (default sound)',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// Builds a local Date at a given "minutes since local midnight" offset
// (matching profiles.awareness_cue_window_start/end_minute's own
// convention), for the local calendar day `dayOffset` days from today
// (0 = today, 1 = tomorrow, ...) -- deliberately local time throughout,
// no UTC conversion, consistent with this app's local-day-boundary
// convention elsewhere (lib/week.js).
function dateAtLocalMinutesForDay(minutesSinceMidnight, dayOffset) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minutesSinceMidnight);
  return date;
}

// Guarantees no two times in `dayTimes` (one calendar day's worth of
// independently random-drawn cue times) land closer together than
// AWARENESS_CUE_MIN_GAP_MS, regardless of how that day's count was
// derived -- a hard floor independent of the today's-count scaling in
// regenerateAwarenessCueSchedule, since scaling alone doesn't rule out
// an unlucky cluster of draws. Sorts first, then nudges each time
// forward just enough to clear the gap from its (possibly already-
// nudged) predecessor. A nudge that would land at or past `windowEnd`
// drops that time entirely rather than scheduling it outside the
// user's chosen window -- so a very dense request in a short window can
// come out with fewer cues than configured, which is the intended
// trade-off (never overlap-clustered, never past the window).
function enforceMinimumGap(dayTimes, windowEnd) {
  const sorted = [...dayTimes].sort((a, b) => a - b);
  const result = [];
  let previousMs = null;
  for (const date of sorted) {
    let ms = date.getTime();
    if (previousMs !== null && ms - previousMs < AWARENESS_CUE_MIN_GAP_MS) {
      ms = previousMs + AWARENESS_CUE_MIN_GAP_MS;
    }
    if (ms >= windowEnd.getTime()) continue;
    result.push(new Date(ms));
    previousMs = ms;
  }
  return result;
}

// Cancels every possible Awareness Cue slot, regardless of how many are
// actually in use right now -- safe/cheap to call whether or not
// anything is currently scheduled.
export async function cancelAwarenessCueSchedule() {
  await Promise.all(
    AWARENESS_CUE_SLOT_IDS.map((id) => Notifications.cancelScheduledNotificationAsync(id))
  );
}

// Regenerates the Awareness Cue batch from scratch: clears every
// previously-scheduled slot, then schedules fresh one-off notifications
// at random times across AWARENESS_CUE_BATCH_DAYS local calendar days
// at once (today included) -- see the multi-day batch redesign,
// 2026-08-22. Callers own their own idempotency (see home.js's
// awareness_cue_batch_valid_until-gated effect) -- calling this again
// mid-batch just re-randomizes everything from today forward, it isn't
// guarded here.
//
// Only TODAY's window is clamped to start no earlier than "now" --
// generating purely against the configured window (e.g. 9am-9pm)
// regardless of when the app happens to be opened would place some
// fraction of today's cues in the already-past part of the window,
// where they can never fire. Every later day in the batch always gets
// its full configured window, since it hasn't started yet by
// definition. If "now" is already past today's window end, today
// simply contributes no cues (accepted per spec: a day the window
// closes before the user ever opens the app gets no cues that day) --
// but later batch days are unaffected and still get scheduled.
//
// Clamping today's start also scales today's target count down to
// match however much of the window is actually left (see
// isClampedToday/scaledTarget below) -- otherwise a count meant to be
// spread across the whole configured window gets crammed into whatever
// fraction of it remains (real bug, found 2026-08-23: 5 cues meant for
// a 6-hour window all landing within one remaining hour). If barely any
// time is left at all, today is skipped entirely rather than forcing a
// cue into a sliver too small to feel natural (AWARENESS_CUE_MIN_
// REMAINING_MS_TO_SCHEDULE). Independent of that scaling, every day's
// times also pass through enforceMinimumGap as a hard floor, so an
// unlucky cluster of random draws can never land unnaturally close
// together regardless of how the count was derived.
//
// "Loose" mode's random count is re-rolled independently for each day
// in the batch (not one shared count for the whole batch), matching
// the day-to-day unpredictability the original single-day design had.
//
// Returns the local 'YYYY-MM-DD' date of the last day this batch
// actually covers (for the caller to write to
// profiles.awareness_cue_batch_valid_until), or null if nothing was
// scheduled at all (only possible if every day in the batch -- today
// included -- ended up with a closed window, which in practice means
// AWARENESS_CUE_BATCH_DAYS is 1 and today's window has already closed).
export async function regenerateAwarenessCueSchedule({
  type,
  frequencyMode,
  count,
  windowStartMinute,
  windowEndMinute,
  soundConfirmed,
}) {
  await ensureAwarenessCueChannels();
  await cancelAwarenessCueSchedule();

  // Untested/unconfirmed (soundConfirmed is null or false) falls back to
  // the default-sound channel rather than assuming the custom psst.wav
  // sound actually plays -- see AWARENESS_CUE_SOUND_DEFAULT_CHANNEL_ID.
  const useCustomSound = type === 'sound' && soundConfirmed === true;
  const channelId =
    type === 'sound'
      ? useCustomSound
        ? AWARENESS_CUE_SOUND_CHANNEL_ID
        : AWARENESS_CUE_SOUND_DEFAULT_CHANNEL_ID
      : AWARENESS_CUE_VIBRATE_CHANNEL_ID;

  const now = new Date();
  const times = [];
  let lastScheduledDayOffset = -1;

  for (let dayOffset = 0; dayOffset < AWARENESS_CUE_BATCH_DAYS; dayOffset++) {
    const windowStart = dateAtLocalMinutesForDay(windowStartMinute, dayOffset);
    const windowEnd = dateAtLocalMinutesForDay(windowEndMinute, dayOffset);
    const isClampedToday = dayOffset === 0 && windowStart < now;
    const effectiveStart = isClampedToday ? now : windowStart;
    if (effectiveStart >= windowEnd) continue;

    const remainingMs = windowEnd.getTime() - effectiveStart.getTime();
    // Only relevant for today when its start got clamped -- a day whose
    // window hasn't started yet always has its full span ahead of it,
    // never this small. See AWARENESS_CUE_MIN_REMAINING_MS_TO_SCHEDULE.
    if (isClampedToday && remainingMs < AWARENESS_CUE_MIN_REMAINING_MS_TO_SCHEDULE) continue;

    const targetCount =
      frequencyMode === 'exact'
        ? count || 1
        : LOOSE_MODE_MIN_COUNT + Math.floor(Math.random() * (LOOSE_MODE_MAX_COUNT - LOOSE_MODE_MIN_COUNT + 1));

    // Today's target is scaled down proportionally to however much of
    // the configured window is actually still ahead, when the window's
    // start has already passed (isClampedToday) -- otherwise a count
    // meant to be spread across the *whole* window gets crammed into
    // whatever's left of it instead (e.g. 5 "surprise me" cues meant
    // for a 6-hour Morning window, all landing within a single
    // remaining hour). Later days always get the full, unscaled target:
    // their window hasn't started yet, so there's nothing to scale
    // against. Math.max(1, ...) rather than letting this round down to
    // 0 -- once remainingMs has already cleared the too-small-to-bother
    // cutoff above, still schedule at least one cue for today.
    const fullSpanMs = Math.max(1, windowEnd.getTime() - windowStart.getTime());
    const scaledTarget = isClampedToday
      ? Math.max(1, Math.round(targetCount * (remainingMs / fullSpanMs)))
      : targetCount;
    const dayCount = Math.min(scaledTarget, AWARENESS_CUE_MAX_DAILY_COUNT);

    const dayTimes = [];
    for (let i = 0; i < dayCount; i++) {
      dayTimes.push(new Date(effectiveStart.getTime() + Math.random() * remainingMs));
    }
    times.push(...enforceMinimumGap(dayTimes, windowEnd));
    lastScheduledDayOffset = dayOffset;
  }

  if (lastScheduledDayOffset < 0) return null;

  times.sort((a, b) => a - b);
  const slotCount = Math.min(times.length, AWARENESS_CUE_SLOT_IDS.length);

  await Promise.all(
    times.slice(0, slotCount).map((date, i) =>
      Notifications.scheduleNotificationAsync({
        identifier: AWARENESS_CUE_SLOT_IDS[i],
        content: {
          title: 'DayTickles',
          ...(useCustomSound ? { sound: AWARENESS_CUE_SOUND } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId,
        },
      })
    )
  );

  return localDateString(-lastScheduledDayOffset);
}

// Diagnostic-only (see app/settings.js): reads the actual currently-
// scheduled Awareness Cue times straight from expo-notifications' own
// scheduler, since nothing persists them client-side (see this file's
// header comment) -- "ask the engine for ground truth" rather than
// tracking a second copy of what we last asked it to do. Filters to
// just AWARENESS_CUE_SLOT_IDS since getAllScheduledNotificationsAsync
// also returns the daily reminders (and any in-flight test cue).
export async function getScheduledAwarenessCueTimes() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const slotIds = new Set(AWARENESS_CUE_SLOT_IDS);
  return all
    .filter((n) => slotIds.has(n.identifier))
    .map((n) => dateFromTrigger(n.trigger))
    .filter(Boolean)
    .sort((a, b) => a - b);
}

// The read-back shape of a scheduled DATE trigger is platform-dependent
// and differs from the shape used to schedule it: Android reports a raw
// ms-epoch value under the key `value` (see NotificationTriggers.kt's
// DateTrigger.toBundle -- "value" to timestamp; the Kotlin *property*
// is named timestamp, but that's not the bundle key JS actually
// receives, a mismatch that cost a debugging round trip), while iOS
// implements a one-off DATE trigger as a non-repeating
// UNCalendarNotificationTrigger under the hood, so it reads back as a
// `calendar` trigger with full dateComponents instead (see
// EXNotificationSerializer.m) -- no `value` field at all there. No iOS
// build of this app exists yet, but this branch costs nothing to keep
// ready. dateComponents.month is 1-based (Foundation convention),
// hence the -1 to match JS Date's 0-based month.
function dateFromTrigger(trigger) {
  if (!trigger) return null;
  if (typeof trigger.value === 'number') return new Date(trigger.value);
  if (trigger.type === 'calendar' && trigger.dateComponents?.year != null) {
    const d = trigger.dateComponents;
    return new Date(d.year, (d.month ?? 1) - 1, d.day ?? 1, d.hour ?? 0, d.minute ?? 0, d.second ?? 0);
  }
  return null;
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

// Fires a one-off, contentless notification through the real
// awareness-cue-sound channel (not a synthetic test channel) so the
// "Did you hear it?" prompt in Settings genuinely tests the same
// channel/sound a real cue would use, not a stand-in. Deliberately no
// body, matching Awareness Cue's own contentless real notifications --
// sendTestReminderNotification's descriptive test body would be a
// false signal here (right channel, wrong shape). ensureAwarenessCueChannels
// runs first since a user testing Sound for the first time may never
// have created this channel yet. Unique identifier, same reasoning as
// sendTestReminderNotification -- can't collide with the real
// AWARENESS_CUE_SLOT_IDS or a previous test.
export async function sendAwarenessCueTestCue() {
  await ensureAwarenessCueChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: `awareness-cue-test-${Date.now()}`,
    content: {
      title: 'DayTickles',
      sound: AWARENESS_CUE_SOUND,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      channelId: AWARENESS_CUE_SOUND_CHANNEL_ID,
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

// Day Dots -- bundled into the evening reminder (profiles.daily_reminder),
// no separate toggle. Eligible ONLY for a fixed window starting exactly
// when tonight's evening reminder fires -- never today's prompt bleeding
// into tomorrow, and never a missed evening caught up on later. If the
// window closes unanswered, the prompt is simply gone for the rest of
// that day -- a deliberate simplification, not a bug: the point is
// immediacy, not backlog-avoidance. Returns today's local 'YYYY-MM-DD'
// while inside the window, or null outside it -- callers should skip
// querying day_dots entirely when this returns null, since nothing
// could ever be eligible.
const DAY_DOTS_WINDOW_MS = 60 * 60 * 1000;

// `now` is an optional injected instant -- defaults to a fresh
// new Date() for any standalone caller, but a caller that needs this
// function's answer to agree with msUntilDayDotsWindowOpens/Closes'
// answer in the SAME logical check (see checkNow() in app/(tabs)/
// home.js) must pass the exact same Date object to all three, not let
// each call its own new Date() independently -- otherwise a multi-
// millisecond drift between two separate "now"s could disagree right
// at the instant the window opens or closes.
export function currentDayDotsPromptDate(now = new Date()) {
  const windowStart = new Date(now);
  windowStart.setHours(EVENING_HOUR, EVENING_MINUTE, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + DAY_DOTS_WINDOW_MS);
  if (now < windowStart || now >= windowEnd) return null;
  return localDateString(0);
}

// Milliseconds remaining in the current Day Dots window, or 0 if not
// currently inside one -- lets a caller (Home) set a real-time expiry
// timer rather than relying solely on the next screen focus to notice
// the window closed (see app/(tabs)/home.js's dayDotsPromptDate effect).
// See currentDayDotsPromptDate's own comment on the `now` parameter.
export function msUntilDayDotsWindowCloses(now = new Date()) {
  const windowStart = new Date(now);
  windowStart.setHours(EVENING_HOUR, EVENING_MINUTE, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + DAY_DOTS_WINDOW_MS);
  return now >= windowStart && now < windowEnd ? windowEnd.getTime() - now.getTime() : 0;
}

// Milliseconds until the Day Dots window next opens -- symmetric to
// msUntilDayDotsWindowCloses above, and the missing half of the
// mechanism: a screen that stays continuously focused from before the
// window through its open time never notices the window opened at all,
// since currentDayDotsPromptDate only gets re-evaluated on a fresh
// focus or an external reload (confirmed live, 2026-09-05 -- a Metro
// console capture across a full window cycle showed zero self-
// initiated re-checks). Home's effect uses this to schedule a real
// wake-up rather than silently waiting for the next focus event.
// Returns 0 if already inside today's window (nothing to wait for --
// see msUntilDayDotsWindowCloses instead), otherwise the countdown to
// the next open: today's if it hasn't happened yet, or tomorrow's if
// today's has already closed -- never a stale/negative value for an
// already-passed today. See currentDayDotsPromptDate's own comment on
// the `now` parameter.
export function msUntilDayDotsWindowOpens(now = new Date()) {
  const windowStart = new Date(now);
  windowStart.setHours(EVENING_HOUR, EVENING_MINUTE, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + DAY_DOTS_WINDOW_MS);
  if (now >= windowStart && now < windowEnd) return 0;
  if (now >= windowEnd) windowStart.setDate(windowStart.getDate() + 1);
  return windowStart.getTime() - now.getTime();
}
