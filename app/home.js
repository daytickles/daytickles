import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';
import Button from '../components/Button';

export default function Home() {
  const { session, profile } = useAuth();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to DayTickles</Text>
      <Text style={styles.bodyText}>Signed in as: {session?.user?.email}</Text>
      {profile && <Text style={styles.profileText}>{profile.avatar_emoji} {profile.username}</Text>}
      <View style={styles.spacer} />
      <Button title="Manage Goals" onPress={() => router.push('/goals')} variant="primary" />
      <View style={styles.spacer} />
      <Button title="Sign Out" onPress={signOut} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: C.bg },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: C.rustDark },
  bodyText: { color: C.text },
  profileText: { marginTop: 8, marginBottom: 8, fontSize: 16, color: C.text },
  spacer: { height: 12 },
});