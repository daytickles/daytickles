import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../lib/theme';
import Button from '../components/Button';

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const [status, setStatus] = useState('');
  const { session, profile } = useAuth();

  useEffect(() => {
    if (session && profile) {
      router.replace(profile.onboarded ? '/home' : '/onboarding');
    }
  }, [session, profile]);

  async function signInWithGoogle() {
    try {
      setStatus('Starting sign-in...');
      const redirectTo = AuthSession.makeRedirectUri({ scheme: 'daytickles' });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error) throw error;

      await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  }

  return (
    <View style={styles.container}>
      <Button title="Sign in with Google" onPress={signInWithGoogle} variant="primary" />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: C.bg },
  status: { marginTop: 20, color: C.subtext },
});