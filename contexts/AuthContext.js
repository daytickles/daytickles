import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { registerPushToken } from '../lib/pushToken';
import { fetchWritingPrompts } from '../lib/writingPrompts';

const AuthContext = createContext(null);

// Fields actually read anywhere in the app (rendering or routing) — see
// home.js, index.js, login.js, settings.js, lib/sharing.js. Deliberately
// excludes bookkeeping columns like updated_at, which the
// set_profiles_updated_at trigger bumps on every write regardless of
// whether anything the UI cares about changed.
const RENDER_RELEVANT_FIELDS = [
  'accent_theme',
  'home_guide_seen',
  'avatar_emoji',
  'username',
  'onboarded',
  'subscription_plan',
  'subscription_expires_at',
  'share_period_start',
  'share_count_this_period',
  'trial_started_at',
  'day_journal_enabled',
  'week_start_day',
  'is_founding_member',
  'founding_member_number',
  'founding_member_taking_part',
  'founding_member_reminders_enabled',
  'founding_member_failure_message_seen',
  'founding_member_reminder_dismissed_at',
  'referral_code',
  'quick_start_dismissed',
  'awareness_cue_enabled',
  'awareness_cue_type',
  'awareness_cue_frequency_mode',
  'awareness_cue_count',
  'awareness_cue_window_start_minute',
  'awareness_cue_window_end_minute',
  'awareness_cue_sound_confirmed',
  'awareness_cue_batch_valid_until',
  'awareness_cue_batch_source',
];

function profilesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return RENDER_RELEVANT_FIELDS.every((key) => a[key] === b[key]);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [writingPrompts, setWritingPrompts] = useState([]);
  const handledRef = useRef(false);
  const promptIndexRef = useRef(0);

  // Cycles through the session's shuffled prompt list with a persistent
  // cursor, so repeated calls across separate New Tickle visits never
  // repeat back-to-back -- see lib/writingPrompts.js.
  function getNextPrompt() {
    if (writingPrompts.length === 0) return null;
    const prompt = writingPrompts[promptIndexRef.current % writingPrompts.length];
    promptIndexRef.current += 1;
    return prompt;
  }

  // Wrapped in useCallback (stable deps -- only ever touches setProfile,
  // a stable setState setter) so refreshProfile below can depend on it
  // without picking up a new identity on every call.
  const loadProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('loadProfile error:', error.message);
      setProfile(null);
    } else {
      setProfile((prev) => (profilesEqual(prev, data) ? prev : data));
    }
  }, []);

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
      if (data.session) {
        await loadProfile(data.session.user.id);
        // Not awaited — permission prompt + token fetch shouldn't hold up
        // clearing the loading state below.
        registerPushToken(data.session.user.id);
        fetchWritingPrompts().then((prompts) => {
          setWritingPrompts(prompts);
          promptIndexRef.current = 0;
        });
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('Auth event:', event, newSession?.user?.email);
      setSession(newSession);
      if (newSession) {
        handledRef.current = false;
        await loadProfile(newSession.user.id);
        registerPushToken(newSession.user.id);
        fetchWritingPrompts().then((prompts) => {
          setWritingPrompts(prompts);
          promptIndexRef.current = 0;
        });
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

  // Stable identity (only changes if `session` itself changes) -- was
  // previously a plain function, recreated on every AuthProvider
  // re-render (i.e. every single profile update, including its own).
  // Any consumer with this in a useCallback/effect dependency array
  // (e.g. founding-member.js's load()) would get spuriously re-created
  // -- and re-fired, if wired into a useFocusEffect -- on every
  // refresh, not just when session truly changes.
  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, setProfile, loading, refreshProfile, getNextPrompt }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}