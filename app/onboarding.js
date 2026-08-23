import React, { useState } from 'react';
import {
  TextInput, Text, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../lib/theme';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';
import { redeemFoundingMemberReferralCode } from '../lib/foundingMember';

// Short and human, not trying to defeat collisions on its own -- the
// self-correcting fallback (tapping the suggestion re-runs handleSave,
// which re-triggers this same path if IT also collides) is what
// actually handles a repeat, not a wider suffix range here. No
// separator, matching how someone would naturally type it themselves.
function suggestUsername(base) {
  const suffix = Math.floor(10 + Math.random() * 90);
  return `${base}${suffix}`;
}

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [status, setStatus] = useState('');
  const [usernameSuggestion, setUsernameSuggestion] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!username.trim()) {
      setStatus('Please enter a username.');
      return;
    }
    setSaving(true);
    setStatus('');
    setUsernameSuggestion('');

    const trimmedUsername = username.trim();
    const { error } = await supabase
      .from('profiles')
      .update({
        username: trimmedUsername,
        onboarded: true,
      })
      .eq('id', session.user.id);

    if (error) {
      setSaving(false);
      // 23505 = unique_violation -- the only unique column this update
      // ever writes is username (onboarded isn't unique), so this can
      // only mean the username's taken, not some other constraint.
      if (error.code === '23505') {
        setStatus('That username is already taken.');
        setUsernameSuggestion(suggestUsername(trimmedUsername));
      } else {
        setStatus(`Error: ${error.message}`);
      }
      return;
    }

    // Optional, and never blocks onboarding -- a typo'd, invalid, or
    // missing code just means no referral gets credited, not a failed
    // signup. Navigation happens immediately either way, so there's no
    // useful moment to surface a redemption error here.
    if (referralCode.trim()) {
      try {
        await redeemFoundingMemberReferralCode(referralCode.trim());
      } catch {
        // Swallowed for the same reason.
      }
    }

    setSaving(false);
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

      {!!usernameSuggestion && (
        <TouchableOpacity
          onPress={() => {
            setUsername(usernameSuggestion);
            setUsernameSuggestion('');
            setStatus('');
          }}
        >
          <Text style={styles.suggestion}>Try "{usernameSuggestion}" instead?</Text>
        </TouchableOpacity>
      )}

      <TextInput
        style={styles.input}
        placeholder="Referral code (optional)"
        placeholderTextColor={C.faint}
        value={referralCode}
        onChangeText={setReferralCode}
        autoCapitalize="characters"
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
  suggestion: { marginTop: -12, marginBottom: 16, color: C.rust, fontSize: 14, fontWeight: '600' },
});