import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const handledRef = useRef(false);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('loadProfile error:', error.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
  }

  async function handleUrl(url) {
    if (!url || handledRef.current) return;
    const hashPart = url.split('#')[1];
    if (!hashPart) return;

    const params = new URLSearchParams(hashPart);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    if (access_token && refresh_token) {
      handledRef.current = true;
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        console.error('setSession error:', error.message);
        handledRef.current = false;
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('Auth event:', event, newSession?.user?.email);
      setSession(newSession);
      if (newSession) {
        handledRef.current = false;
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const linkingSubscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => {
      listener.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}