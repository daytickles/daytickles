import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, moodColorFor } from '../lib/theme';

function formatEntryDate(entryDate) {
  return new Date(`${entryDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const TABS = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'mine', label: 'Mine' },
];

export default function Feed() {
  const { session } = useAuth();
  const [tab, setTab] = useState('everyone');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFeed = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    let query = supabase
      .from('tickle_entries')
      .select('id, entry_date, text_content, mood, created_at, user_id, profiles!tickle_entries_user_id_fkey(username, avatar_emoji, accent_theme)')
      .order('created_at', { ascending: false });

    if (tab === 'mine') {
      // Mine shows all of the signed-in user's own entries, private and
      // public alike — Home truncates to one line, so Mine is where you
      // read your own entries in full regardless of sharing status.
      query = query.eq('user_id', session.user.id);
    } else {
      query = query.eq('visibility', 'public');
    }

    const { data, error } = await query;
    if (!error) setEntries(data || []);
    setLoading(false);
  }, [session, tab]);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  function renderEntry({ item }) {
    const accent = accentFor(item.profiles?.accent_theme);
    return (
      <View style={styles.entryCard}>
        <View style={styles.entryRow}>
          <View style={[styles.moodDot, { backgroundColor: moodColorFor(item.mood, accent) }]} />
          <View style={styles.entryBody}>
            <Text style={styles.authorText}>
              {item.profiles?.avatar_emoji} {item.profiles?.username}
            </Text>
            <Text style={styles.entryText}>{item.text_content}</Text>
            <Text style={styles.entryDate}>{formatEntryDate(item.entry_date)}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.backLink}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Feed</Text>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[styles.tabButton, tab === t.id && styles.tabButtonActive]}
          >
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

      <FlatList
        style={styles.list}
        data={entries}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderEntry}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading && (
            <Text style={styles.emptyText}>
              {tab === 'mine' ? "You haven't shared any tickles to the feed yet." : 'No public tickles yet.'}
            </Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 60, paddingHorizontal: 20 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 16 },

  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabButton: {
    flex: 1, paddingVertical: 10, borderRadius: 20,
    alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  tabButtonActive: { backgroundColor: C.rust, borderColor: C.rust },
  tabLabel: { fontSize: 14, fontWeight: '600', color: C.subtext },
  tabLabelActive: { color: C.bg },

  loader: { marginTop: 12 },
  list: { flex: 1 },
  listContent: { paddingBottom: 40 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24 },

  entryCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12,
  },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  moodDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12, marginTop: 4 },
  entryBody: { flex: 1 },
  authorText: { fontSize: 13, fontWeight: '600', color: C.rustDark, marginBottom: 4 },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },
  entryDate: { fontSize: 12, color: C.subtext, marginTop: 8 },
});
