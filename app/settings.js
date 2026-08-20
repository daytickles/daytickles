import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView, Alert, Linking, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, ACCENT_THEMES, accentFor, darken, textOn, withAlpha, NATURE_ORDER } from '../lib/theme';
import { DEFAULT_WEEK_START_DAY } from '../lib/week';
import { flagEmoji, countryNameFor } from '../lib/country';
import Button from '../components/Button';
import HomeGuide from '../components/HomeGuide';
import AboutModal from '../components/AboutModal';
import CountryPickerModal from '../components/CountryPickerModal';
import PinSetupModal from '../components/PinSetupModal';
import DeleteAccountModal from '../components/DeleteAccountModal';
import NatureIcon from '../components/NatureIcon';
import WallpaperBackground from '../components/WallpaperBackground';
import {
  requestReminderPermission,
  scheduleDailyReminder,
  cancelDailyReminder,
  sendTestReminderNotification,
  sendTestAwarenessCueSound,
} from '../lib/reminders';
import { isReviewAvailable, requestReview } from '../lib/rateUs';
import { hasPinSet, clearPin } from '../lib/pinLock';
import { deleteAccount } from '../lib/deleteAccount';

// 0=Sunday..6=Saturday, matching lib/week.js/profiles.week_start_day's
// own convention -- no translation needed between this list and what
// gets saved.
const WEEK_START_OPTIONS = [
  { day: 0, label: 'Su' },
  { day: 1, label: 'Mo' },
  { day: 2, label: 'Tu' },
  { day: 3, label: 'We' },
  { day: 4, label: 'Th' },
  { day: 5, label: 'Fr' },
  { day: 6, label: 'Sa' },
];

// Mirrors home.js's own NATURE_LABELS (and create.js's
// TICKLE_NATURE_OPTIONS order) -- received/given/self, in that order.
const NATURE_LABELS = {
  received: 'Made me smile',
  given: 'I paid forward',
  self: 'Mood boost',
};

export default function Settings() {
  const { profile, setProfile, refreshProfile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [showGuide, setShowGuide] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [savingTheme, setSavingTheme] = useState(null);
  const [savingWeekStartDay, setSavingWeekStartDay] = useState(null);
  const [savingDayJournal, setSavingDayJournal] = useState(false);
  const [savingNotifyOnLikes, setSavingNotifyOnLikes] = useState(false);
  const [savingCountry, setSavingCountry] = useState(false);
  const [savingDailyReminder, setSavingDailyReminder] = useState(false);
  const [savingGoal, setSavingGoal] = useState(null);
  const [reminderPermissionDenied, setReminderPermissionDenied] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [togglingPinLock, setTogglingPinLock] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // PIN lock is local-only (SecureStore, see lib/pinLock.js) — not part
  // of profile, so its current state has to be read on mount rather than
  // coming from AuthContext.
  useEffect(() => {
    hasPinSet().then(setPinEnabled);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    // replace() alone only swaps the current top-of-stack entry — since
    // Settings is reached via router.push from Home, that would leave
    // Home stranded underneath, still mounted (confirmed live: this was
    // the actual cause of the Home guide's stacking-Modal bug).
    // dismissAll() first pops every pushed screen back to the stack's
    // root before replace swaps that root for /login, so nothing
    // survives sign-out.
    router.dismissAll();
    router.replace('/login');
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      "This permanently deletes your account and everything in it — tickles, likes, follows, goals, and shares. There's no way to undo this.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => setShowDeleteConfirm(true) },
      ]
    );
  }

  // Deletion itself already succeeded server-side by the time this
  // runs (that's the source of truth) — signOut() here is just local
  // cleanup, so its own success/failure doesn't gate navigating away.
  async function handleDeleteAccount() {
    setDeleteError('');
    setDeletingAccount(true);

    const { error } = await deleteAccount();
    setDeletingAccount(false);

    if (error) {
      setDeleteError('Something went wrong — please try again.');
      return;
    }

    setShowDeleteConfirm(false);
    await supabase.auth.signOut().catch(() => {});
    router.dismissAll();
    router.replace('/login');
  }

  async function handlePickTheme(themeId) {
    if (!profile || themeId === profile.accent_theme) return;
    const previous = profile;

    setProfile({ ...profile, accent_theme: themeId });
    setSavingTheme(themeId);

    const { error } = await supabase.from('profiles').update({ accent_theme: themeId }).eq('id', profile.id);
    setSavingTheme(null);

    if (error) {
      setProfile(previous);
    } else {
      refreshProfile();
    }
  }

  async function handlePickWeekStartDay(day) {
    const current = profile?.week_start_day ?? DEFAULT_WEEK_START_DAY;
    if (!profile || day === current) return;
    const previous = profile;

    setProfile({ ...profile, week_start_day: day });
    setSavingWeekStartDay(day);

    const { error } = await supabase.from('profiles').update({ week_start_day: day }).eq('id', profile.id);
    setSavingWeekStartDay(null);

    if (error) {
      setProfile(previous);
    } else {
      refreshProfile();
    }
  }

  async function handleToggleDayJournal(value) {
    if (!profile) return;
    const previous = profile;

    setProfile({ ...profile, day_journal_enabled: value });
    setSavingDayJournal(true);

    const { error } = await supabase
      .from('profiles')
      .update({ day_journal_enabled: value })
      .eq('id', profile.id);
    setSavingDayJournal(false);

    if (error) {
      setProfile(previous);
    } else {
      refreshProfile();
    }
  }

  async function handleToggleNotifyOnLikes(value) {
    if (!profile) return;
    const previous = profile;

    setProfile({ ...profile, notify_on_likes: value });
    setSavingNotifyOnLikes(true);

    const { error } = await supabase
      .from('profiles')
      .update({ notify_on_likes: value })
      .eq('id', profile.id);
    setSavingNotifyOnLikes(false);

    if (error) {
      setProfile(previous);
    } else {
      refreshProfile();
    }
  }

  // Requests permission before persisting the flag on — a denied
  // permission means the reminder can never actually fire, so the
  // toggle stays off and an inline note explains why rather than
  // silently saving a preference the OS won't honor.
  async function handleToggleDailyReminder(value) {
    if (!profile) return;
    setReminderPermissionDenied(false);

    if (value) {
      const granted = await requestReminderPermission();
      if (!granted) {
        setReminderPermissionDenied(true);
        return;
      }
    }

    const previous = profile;
    setProfile({ ...profile, daily_reminder: value });
    setSavingDailyReminder(true);

    const { error } = await supabase
      .from('profiles')
      .update({ daily_reminder: value })
      .eq('id', profile.id);
    setSavingDailyReminder(false);

    if (error) {
      setProfile(previous);
      return;
    }

    refreshProfile();
    try {
      if (value) {
        await scheduleDailyReminder();
      } else {
        await cancelDailyReminder();
      }
    } catch {
      // Preference is saved regardless — Home's mount reconciliation
      // will retry scheduling next time the app opens.
    }
  }

  // Stepper, not a free-text field -- clamps at 0 (stored as null, "off")
  // rather than going negative. null/0 both render as "Off"; there's no
  // separate concept of an explicit zero target. Takes the literal
  // column name rather than deriving it internally, since it's written
  // generically enough to back any of these goal columns -- currently
  // only daily_goal_<nature> (Daily Vibe Goals, below) renders a
  // control. daily_total_goal's own "Weekly Rhythm Goal" control is
  // hidden (not deleted -- see migration 0034) since the rhythm chart
  // dropped its goal-line visualization when it switched to the bubble
  // grid, leaving that setting with no visible effect anywhere.
  async function handleAdjustGoal(column, delta) {
    if (!profile) return;
    const current = profile[column] || 0;
    const next = Math.max(0, current + delta);
    const value = next === 0 ? null : next;
    const previous = profile;

    setProfile({ ...profile, [column]: value });
    setSavingGoal(column);

    const { error } = await supabase.from('profiles').update({ [column]: value }).eq('id', profile.id);
    setSavingGoal(null);

    if (error) {
      setProfile(previous);
    } else {
      refreshProfile();
    }
  }

  // Enabling only flips the Switch once PinSetupModal's enter-twice flow
  // actually saves a PIN (handlePinSetupComplete) — the toggle stays off
  // while the modal is open. Disabling has no confirmation step, matching
  // every other toggle in this screen.
  async function handleTogglePinLock(value) {
    if (value) {
      setShowPinSetup(true);
      return;
    }
    setTogglingPinLock(true);
    await clearPin();
    setTogglingPinLock(false);
    setPinEnabled(false);
  }

  function handlePinSetupComplete() {
    setShowPinSetup(false);
    setPinEnabled(true);
  }

  async function handleRateUs() {
    try {
      const available = await isReviewAvailable();
      if (available) await requestReview();
    } catch {
      // Native module may be unavailable on some builds — fail silently,
      // same as handleToggleDailyReminder's reminder scheduling.
    }
  }

  // code is a 2-letter country code, or null for "Prefer not to say" —
  // the DB-level format constraint (migration 0008) is the real guard;
  // this just has to pass through whatever the picker hands back.
  async function handleSelectCountry(code) {
    if (!profile) return;
    const previous = profile;

    setProfile({ ...profile, country: code });
    setSavingCountry(true);
    setShowCountryPicker(false);

    const { error } = await supabase
      .from('profiles')
      .update({ country: code })
      .eq('id', profile.id);
    setSavingCountry(false);

    if (error) {
      setProfile(previous);
    } else {
      refreshProfile();
    }
  }

  return (
    <WallpaperBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.backLink}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Accent color</Text>
        <View style={styles.swatchRow}>
          {ACCENT_THEMES.map((theme) => {
            const selected = profile?.accent_theme === theme.id;
            return (
              <TouchableOpacity
                key={theme.id}
                onPress={() => handlePickTheme(theme.id)}
                disabled={savingTheme !== null}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: theme.card },
                    selected && { borderColor: accentDark },
                  ]}
                >
                  {selected && <Ionicons name="checkmark" size={18} color={textOn(theme.card)} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.spacer} />

        <Text style={styles.label}>Week starts on</Text>
        <View style={styles.weekDayRow}>
          {WEEK_START_OPTIONS.map((option) => {
            const selected = (profile?.week_start_day ?? DEFAULT_WEEK_START_DAY) === option.day;
            return (
              <TouchableOpacity
                key={option.day}
                onPress={() => handlePickWeekStartDay(option.day)}
                disabled={savingWeekStartDay !== null}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={[styles.daySwatch, selected && { backgroundColor: accentDark, borderColor: accentDark }]}>
                  {selected ? (
                    <Ionicons name="checkmark" size={16} color={textOn(accentDark)} />
                  ) : (
                    <Text style={styles.daySwatchLabel}>{option.label}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.spacer} />

        <Text style={styles.label}>Country</Text>
        <TouchableOpacity
          style={styles.countryRow}
          onPress={() => setShowCountryPicker(true)}
          disabled={savingCountry}
        >
          <Text style={styles.countryValue}>
            {profile?.country ? `${flagEmoji(profile.country)}  ${countryNameFor(profile.country)}` : 'Not set'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.explainerText}>
          Purely social — shows a flag next to your name so others can see roughly where you're
          tickling from. Never required, and you can change or clear it anytime.
        </Text>
        <View style={styles.spacer} />

        <Button title="Manage Goals" onPress={() => router.push('/goals')} variant="secondary" />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Daily Vibe Goals</Text>
        <Text style={styles.explainerText}>
          Optional — set a target for any vibe and its lightbulb lights up on Home once you hit it
          that day.
        </Text>
        <View style={{ height: 8 }} />
        {NATURE_ORDER.map((key) => {
          const column = `daily_goal_${key}`;
          const value = profile?.[column] || null;
          const saving = savingGoal === column;
          return (
            <View key={key} style={styles.vibeGoalRow}>
              <NatureIcon nature={key} size={18} color={C.subtext} style={styles.vibeGoalIcon} />
              <Text style={styles.vibeGoalLabel}>{NATURE_LABELS[key]}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  onPress={() => handleAdjustGoal(column, -1)}
                  disabled={saving || !value}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="remove-circle-outline" size={20} color={value ? C.text : C.faint} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{value || 'Off'}</Text>
                <TouchableOpacity
                  onPress={() => handleAdjustGoal(column, 1)}
                  disabled={saving}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={C.text} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Day Journal</Text>
          <Switch
            value={!!profile?.day_journal_enabled}
            onValueChange={handleToggleDayJournal}
            disabled={savingDayJournal}
            trackColor={{ false: C.border, true: accentDark }}
            thumbColor={C.card}
          />
        </View>
        <View style={styles.spacer} />

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Daily reminder</Text>
          <Switch
            value={!!profile?.daily_reminder}
            onValueChange={handleToggleDailyReminder}
            disabled={savingDailyReminder}
            trackColor={{ false: C.border, true: accentDark }}
            thumbColor={C.card}
          />
        </View>
        {reminderPermissionDenied && (
          <Text style={styles.explainerText}>
            Notifications permission was denied — enable it for DayTickles in your device settings
            to get the daily reminder.
          </Text>
        )}
        {/* On-demand test button: fires sendTestReminderNotification (lib/reminders.js)
            so reminder display can be tested without waiting for 8am/8pm. */}
        <Button
          title="Send test notification"
          variant="secondary"
          onPress={() => sendTestReminderNotification()}
        />
        <View style={styles.spacer} />

        {/* TEMPORARY -- Awareness Cue feasibility test only, remove this
            button and the Vibration import above once the feel-test is
            done. React Native's built-in Vibration API -- no new native
            module, no new build, works on this dev-client as-is. Sound
            deliberately left out: expo-av/expo-audio isn't installed,
            there's no sound asset in the project yet, and adding either
            would need a fresh EAS/dev-client build (audited before
            writing this, per tonight's Crashlytics build-vs-JS-reload
            lesson) -- out of scope for this quick test. */}
        <Button
          title="Test vibration burst (Awareness Cue)"
          variant="secondary"
          onPress={() => Vibration.vibrate(400)}
        />
        <View style={styles.spacer} />

        {/* TEMPORARY -- Awareness Cue feasibility test only, remove this
            button (and sendTestAwarenessCueSound + the awareness-cue
            channel in lib/reminders.js, and the "sounds" plugin config
            in app.json) once the feel-test is done. Delivered as a
            local notification carrying a custom sound, reusing the same
            expo-notifications path as the daily reminder above --
            requires a fresh EAS/dev-client build to actually play, a
            Metro reload alone won't pick up the bundled sound asset. */}
        <Button
          title="Test sound cue (Awareness Cue)"
          variant="secondary"
          onPress={() => sendTestAwarenessCueSound()}
        />
        <View style={styles.spacer} />
        <View style={styles.spacer} />

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Notify me of new likes</Text>
          <Switch
            value={!!profile?.notify_on_likes}
            onValueChange={handleToggleNotifyOnLikes}
            disabled={savingNotifyOnLikes}
            trackColor={{ false: C.border, true: accentDark }}
            thumbColor={C.card}
          />
        </View>
        <Text style={styles.explainerText}>
          Controls push notifications only — likes always show up in your notification list
          either way.
        </Text>
        <View style={styles.spacer} />

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>PIN lock</Text>
          <Switch
            value={pinEnabled}
            onValueChange={handleTogglePinLock}
            disabled={togglingPinLock}
            trackColor={{ false: C.border, true: accentDark }}
            thumbColor={C.card}
          />
        </View>
        <Text style={styles.explainerText}>
          Locks the app behind a PIN (with biometrics as a shortcut) every time it's opened or
          resumed from the background. Stored only on this device, never sent anywhere.
        </Text>
      </View>

      <Button title="How DayTickles works" onPress={() => setShowGuide(true)} variant="secondary" />
      <View style={styles.spacer} />
      <Button title="About DayTickles" onPress={() => setShowAbout(true)} variant="secondary" />
      <View style={styles.spacer} />
      <Button title="Privacy Policy" onPress={() => Linking.openURL('https://daytickles.app/privacy')} variant="secondary" />
      <View style={styles.spacer} />
      <Button title="Rate Us" onPress={handleRateUs} variant="secondary" />
      <View style={styles.spacer} />
      <Button
        title="Feedback"
        onPress={() => Linking.openURL('mailto:feedback@daytickles.com')}
        variant="secondary"
      />
      <View style={styles.spacer} />
      <Button title="Sign Out" onPress={signOut} variant="secondary" />
      <View style={styles.spacer} />

      <TouchableOpacity onPress={confirmDeleteAccount} style={styles.deleteAccountLink}>
        <Text style={styles.deleteAccountLinkText}>Delete Account</Text>
      </TouchableOpacity>

      <HomeGuide visible={showGuide} onClose={() => setShowGuide(false)} />
      <AboutModal visible={showAbout} onClose={() => setShowAbout(false)} />
      <CountryPickerModal
        visible={showCountryPicker}
        value={profile?.country}
        onSelect={handleSelectCountry}
        onDismiss={() => setShowCountryPicker(false)}
      />
      <DeleteAccountModal
        visible={showDeleteConfirm}
        deleting={deletingAccount}
        error={deleteError}
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteError('');
        }}
      />
      <PinSetupModal
        visible={showPinSetup}
        onCancel={() => setShowPinSetup(false)}
        onComplete={handlePinSetupComplete}
      />
    </ScrollView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 24 },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16,
    backgroundColor: withAlpha(C.subtext, 0.1), borderColor: C.border,
  },
  label: { fontSize: 14, color: C.subtext, marginBottom: 10 },
  swatchRow: { flexDirection: 'row', gap: 14 },
  swatch: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  // Narrower gap than swatchRow -- 7 day options vs 5 accent colors
  // need to fit the same content width.
  weekDayRow: { flexDirection: 'row', gap: 8 },
  daySwatch: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  daySwatchLabel: { fontSize: 12, fontWeight: '600', color: C.subtext },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  toggleLabel: { flex: 1, fontSize: 15, color: C.text, marginRight: 12 },
  vibeGoalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  vibeGoalIcon: { marginRight: 10 },
  vibeGoalLabel: { flex: 1, fontSize: 15, color: C.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperValue: { fontSize: 15, fontWeight: '600', color: C.text, minWidth: 28, textAlign: 'center' },
  countryRow: {
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  countryValue: { fontSize: 15, color: C.text },
  explainerText: { fontSize: 12, color: C.subtext, lineHeight: 16 },
  spacer: { height: 12 },
  deleteAccountLink: { alignItems: 'center', paddingVertical: 4 },
  deleteAccountLinkText: {
    fontSize: 13, color: C.subtext, fontWeight: '600', textDecorationLine: 'underline',
  },
});
