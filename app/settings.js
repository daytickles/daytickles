import { useState } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, ACCENT_THEMES, accentFor, darken, textOn } from '../lib/theme';
import Button from '../components/Button';
import HomeGuide from '../components/HomeGuide';

export default function Settings() {
  const { profile, setProfile, refreshProfile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [showGuide, setShowGuide] = useState(false);
  const [savingTheme, setSavingTheme] = useState(null);
  const [savingTickleNature, setSavingTickleNature] = useState(false);

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

      <Button title="Manage Goals" onPress={() => router.push('/goals')} variant="secondary" />
      <View style={styles.spacer} />
      <Button title="How DayTickles works" onPress={() => setShowGuide(true)} variant="secondary" />
      <View style={styles.spacer} />
      <Button title="Sign Out" onPress={signOut} variant="secondary" />

      <HomeGuide visible={showGuide} onClose={() => setShowGuide(false)} />
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
  spacer: { height: 12 },
});
