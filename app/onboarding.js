import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../lib/theme';
import Button from '../components/Button';

const AVATAR_OPTIONS = ['😀', '🐸', '🌟', '🔥', '🌈', '🦊', '🎯', '🌻'];

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!username.trim()) {
      setStatus('Please enter a username.');
      return;
    }
    setSaving(true);
    setStatus('');

    const { error } = await supabase
      .from('profiles')
      .update({
        username: username.trim(),
        avatar_emoji: avatar,
        onboarded: true,
      })
      .eq('id', session.user.id);

    setSaving(false);

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    await refreshProfile();
    router.replace('/home');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome! Let's set you up.</Text>

      <TextInput
        style={styles.input}
        placeholder="Choose a username"
        placeholderTextColor={C.faint}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Pick an avatar</Text>
      <View style={styles.avatarRow}>
        {AVATAR_OPTIONS.map((emoji) => (
          <TouchableOpacity
            key={emoji}
            onPress={() => setAvatar(emoji)}
            style={[styles.avatarOption, avatar === emoji && styles.avatarSelected]}
          >
            <Text style={styles.avatarEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button
        title={saving ? 'Saving...' : 'Continue'}
        onPress={handleSave}
        disabled={saving}
        variant="primary"
      />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: C.bg },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: C.rustDark },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: C.card,
    color: C.text,
  },
  label: { fontSize: 14, color: C.subtext, marginBottom: 8 },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24 },
  avatarOption: {
    width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center',
    margin: 4, borderWidth: 2, borderColor: 'transparent',
    backgroundColor: C.card,
  },
  avatarSelected: { borderColor: C.rust, backgroundColor: C.sparkleBg },
  avatarEmoji: { fontSize: 24 },
  status: { marginTop: 12, color: C.subtext, textAlign: 'center' },
});