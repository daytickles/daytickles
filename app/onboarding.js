import React, { useState } from 'react';
import {
  TextInput, Text, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../lib/theme';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
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
    <WallpaperBackground>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Welcome! Let's set you up.</Text>

      <TextInput
        style={styles.input}
        placeholder="Choose a username"
        placeholderTextColor={C.faint}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <Button
        title={saving ? 'Saving...' : 'Continue'}
        onPress={handleSave}
        disabled={saving}
        variant="primary"
      />
      <Text style={styles.status}>{status}</Text>
    </ScrollView>
    </KeyboardAvoidingView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
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
  status: { marginTop: 12, color: C.subtext, textAlign: 'center' },
});