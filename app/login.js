import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { router, useNavigation } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../lib/theme';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const [status, setStatus] = useState('');
  const { session, profile } = useAuth();
  const navigation = useNavigation();

  // After a fresh sign-in a second, blurred Login can stay mounted under
  // the tabs, and it used to send the user to Home whenever the profile
  // object changed (e.g. from Settings' accent, week start and country
  // pickers). The focus check and the narrowed deps stop that: only the
  // focused Login redirects, and a new profile object alone doesn't
  // re-run it.
  useEffect(() => {
    if (session && profile && navigation.isFocused()) {
      router.replace(profile.onboarded ? '/home' : '/onboarding');
    }
  }, [session, !!profile, profile?.onboarded, navigation]);

  async function signInWithGoogle() {
    try {
      setStatus('Starting sign-in...');
      const redirectTo = AuthSession.makeRedirectUri();

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
    <WallpaperBackground>
      <View style={styles.container}>
        <Button title="Sign in with Google" onPress={signInWithGoogle} variant="primary" />
        <Text style={styles.disclosure}>
          By continuing, you agree to our{' '}
          <Text style={styles.disclosureLink} onPress={() => Linking.openURL('https://daytickles.app/privacy')}>
            Privacy Policy
          </Text>
        </Text>
        <Text style={styles.status}>{status}</Text>
      </View>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  disclosure: { marginTop: 16, fontSize: 12, color: C.subtext, textAlign: 'center' },
  disclosureLink: { textDecorationLine: 'underline' },
  status: { marginTop: 20, color: C.subtext },
});