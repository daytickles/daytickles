import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, ACCENT_THEMES } from '../lib/theme';
import Button from '../components/Button';
import HomeGuide from '../components/HomeGuide';

export default function Settings() {
  const { profile, setProfile, refreshProfile } = useAuth();
  const [showGuide, setShowGuide] = useState(false);
  const [savingTheme, setSavingTheme] = useState(null);

  async function signOut() {
    await supabase.auth.signOut();
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
                  selected && styles.swatchSelected,
                ]}
              >
                {selected && <Ionicons name="checkmark" size={18} color={C.rustDark} />}
              </View>
            </TouchableOpacity>
          );
        })}
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
  swatchSelected: { borderColor: C.rustDark },
  spacer: { height: 12 },
});
