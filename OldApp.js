import React, { useEffect, useState } from 'react';
import { View, Button, Text, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

// --- Fill these in with your own values ---
const SUPABASE_URL = 'https://nzuvxqrnrknyfijowics.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56dXZ4cXJucmtueWZpam93aWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTY2OTQsImV4cCI6MjA5OTgzMjY5NH0.dgRLhokAEMAgiOMPZzS0t08hwAsNtIefyC8_KFrxzYg';
// --------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default function App() {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('Auth event:', event, newSession?.user?.email);
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Logs any deep link that opens the app
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('Deep link received:', event.url);
    });
    return () => subscription.remove();
  }, []);

  async function signInWithGoogle() {
    try {
      setStatus('Starting sign-in...');
      const redirectTo = AuthSession.makeRedirectUri({ scheme: 'daytickles' });
      console.log('Redirect URI:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      console.log('Auth URL:', data.url);

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'success' && result.url) {
        const params = new URLSearchParams(result.url.split('#')[1]);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;
          setStatus('Signed in!');
        } else {
          setStatus('No tokens found in redirect URL.');
        }
      } else {
        setStatus(`Browser closed: ${result.type}`);
      }
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setStatus('Signed out.');
  }

  return (
    <View style={styles.container}>
      {session ? (
        <>
          <Text>Signed in as: {session.user.email}</Text>
          <Button title="Sign Out" onPress={signOut} />
        </>
      ) : (
        <Button title="Sign in with Google" onPress={signInWithGoogle} />
      )}
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  status: {
    marginTop: 20,
    color: 'gray',
  },
});