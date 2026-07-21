import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nzuvxqrnrknyfijowics.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56dXZ4cXJucmtueWZpam93aWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTY2OTQsImV4cCI6MjA5OTgzMjY5NH0.dgRLhokAEMAgiOMPZzS0t08hwAsNtIefyC8_KFrxzYg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});