import { useState } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, ACCENT_THEMES, accentFor, darken, textOn } from '../lib/theme';
import { flagEmoji, countryNameFor } from '../lib/country';
import Button from '../components/Button';
import HomeGuide from '../components/HomeGuide';
import CountryPickerModal from '../components/CountryPickerModal';
import { requestReminderPermission, scheduleDailyReminder, cancelDailyReminder } from '../lib/reminders';
import { isReviewAvailable, requestReview } from '../lib/rateUs';

export default function Settings() {
  const { profile, setProfile, refreshProfile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [showGuide, setShowGuide] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [savingTheme, setSavingTheme] = useState(null);
  const [savingTickleNature, setSavingTickleNature] = useState(false);
  const [savingDayJournal, setSavingDayJournal] = useState(false);
  const [savingCountry, setSavingCountry] = useState(false);
  const [savingDailyReminder, setSavingDailyReminder] = useState(false);
  const [reminderPermissionDenied, setReminderPermissionDenied] = useState(false);

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

  async function handleToggleTickleNature(value) {
    if (!profile) return;
    const previous = profile;

    setProfile({ ...profile, tickle_nature_enabled: value });
    setSavingTickleNature(true);

    const { error } = await supabase
      .from('profiles')
      .update({ tickle_nature_enabled: value })
      .eq('id', profile.id);
    setSavingTickleNature(false);

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
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.backLink}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Settings</Text>

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

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Track the nature of your smiles</Text>
        <Switch
          value={!!profile?.tickle_nature_enabled}
          onValueChange={handleToggleTickleNature}
          disabled={savingTickleNature}
          trackColor={{ false: C.border, true: accentDark }}
          thumbColor={C.card}
        />
      </View>
      <View style={styles.spacer} />

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
      <View style={styles.spacer} />
      <Button title="How DayTickles works" onPress={() => setShowGuide(true)} variant="secondary" />
      <View style={styles.spacer} />
      <Button title="Rate Us" onPress={handleRateUs} variant="secondary" />
      <View style={styles.spacer} />
      <Button title="Sign Out" onPress={signOut} variant="secondary" />

      <HomeGuide visible={showGuide} onClose={() => setShowGuide(false)} />
      <CountryPickerModal
        visible={showCountryPicker}
        value={profile?.country}
        onSelect={handleSelectCountry}
        onDismiss={() => setShowCountryPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: C.bg },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 24 },
  label: { fontSize: 14, color: C.subtext, marginBottom: 10 },
  swatchRow: { flexDirection: 'row', gap: 14 },
  swatch: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  toggleLabel: { flex: 1, fontSize: 15, color: C.text, marginRight: 12 },
  countryRow: {
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  countryValue: { fontSize: 15, color: C.text },
  explainerText: { fontSize: 12, color: C.subtext, lineHeight: 16 },
  spacer: { height: 12 },
});
