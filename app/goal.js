import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { File } from 'expo-file-system';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, NATURE_LABELS, withAlpha } from '../lib/theme';
import { initPinBoardDb, getPhotosForEntries } from '../lib/pinBoardDb';
import PhotoEnlargeModal from '../components/PhotoEnlargeModal';
import WallpaperBackground from '../components/WallpaperBackground';

function formatEntryDate(entryDate) {
  return new Date(`${entryDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The Goal summary -- reached from a row in Home's "Your Goals" card.
// Same shape as the Multickle view (app/tale.js): header, status pill,
// count line, and a simple read-only list of the Tickles tagged to this
// Goal, newest first. Read-only for the same reason tale.js gives:
// tagging/Ripple/Share/Delete all live on the Tickle Stash's EntryCards,
// and duplicating them here wasn't worth it. Goals are private (RLS on
// goals and on the user's own private entries), so unlike tale.js
// there's no author row or follow button -- it's always your own.
export default function Goal() {
  const { session, profile } = useAuth();
  const params = useLocalSearchParams();
  const goalId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [goal, setGoal] = useState(null);
  const [entries, setEntries] = useState([]);
  const [photoUris, setPhotoUris] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [enlargeUri, setEnlargeUri] = useState(null);

  const loadGoal = useCallback(async () => {
    // Nothing to load -- drop straight to the "isn't available" message
    // rather than leaving the spinner up forever.
    if (!session || !goalId) {
      setGoal(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const [goalRes, entriesRes] = await Promise.all([
      supabase
        .from('goals')
        .select('id, label, color, earns_tokens, achieved_at')
        .eq('id', goalId)
        .maybeSingle(),
      supabase
        .from('tickle_entries')
        .select('id, entry_date, created_at, text_content, tickle_nature, entry_kind, media_url')
        .eq('user_id', session.user.id)
        .eq('goal_id', goalId)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    const rows = entriesRes.error ? [] : entriesRes.data || [];
    setGoal(goalRes.error ? null : goalRes.data);
    setEntries(rows);

    // Local-first photo resolution, same as tale.js / home.js: this
    // device's Pin Board file if it still exists, else the entry's own
    // public media_url (only set once a photo entry has been Rippled).
    const uris = new Map();
    if (rows.length) {
      await initPinBoardDb(session.user.id);
      const localPhotos = await getPhotosForEntries(session.user.id, rows.map((e) => e.id));
      for (const e of rows) {
        const local = localPhotos.get(e.id);
        if (local && new File(local.file_path).exists) uris.set(e.id, local.file_path);
        else if (e.media_url) uris.set(e.id, e.media_url);
      }
    }
    setPhotoUris(uris);

    setLoading(false);
  }, [session, goalId]);

  useFocusEffect(
    useCallback(() => {
      loadGoal();
    }, [loadGoal])
  );

  function renderEntry(e) {
    const isPhotoOnly = e.entry_kind === 'photo_only';
    const photoUri = photoUris.get(e.id);
    return (
      <View key={e.id} style={styles.entryCard}>
        <View style={styles.entryHeader}>
          <Text style={styles.entryNature}>{NATURE_LABELS[e.tickle_nature] || ''}</Text>
          <Text style={styles.entryDate}>{formatEntryDate(e.entry_date)}</Text>
        </View>
        {!!photoUri && (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setEnlargeUri(photoUri)}>
            <Image
              source={{ uri: photoUri }}
              style={isPhotoOnly ? styles.entryPhotoSquare : styles.entryPhotoStrip}
            />
          </TouchableOpacity>
        )}
        {!isPhotoOnly && !!e.text_content && <Text style={styles.entryText}>{e.text_content}</Text>}
      </View>
    );
  }

  const count = entries.length;

  return (
    <WallpaperBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        {loading && !goal && <ActivityIndicator color={C.rust} style={styles.loader} />}

        {!loading && !goal && (
          <Text style={styles.emptyText}>This Goal isn't available anymore.</Text>
        )}

        {!!goal && (
          <>
            <View style={styles.titleRow}>
              <View style={[styles.goalDot, { backgroundColor: goal.color }]} />
              <Text style={styles.title}>{goal.label}</Text>
            </View>

            <View style={styles.statusRow}>
              <View style={[styles.statusPill, goal.achieved_at ? styles.statusPillAchieved : styles.statusPillActive]}>
                <Text style={[styles.statusPillText, goal.achieved_at && styles.statusPillTextAchieved]}>
                  {goal.achieved_at ? 'Achieved' : 'Active'}
                </Text>
              </View>
              <Text style={styles.statusMeta}>
                {count} Tickle{count === 1 ? '' : 's'}
              </Text>
              {/* Hidden when the Tokens master switch is off, same
                  "!== false" idiom as CornerNav's showTokens. */}
              {goal.earns_tokens && profile?.tokens_enabled !== false && (
                <MaterialCommunityIcons name="circle-multiple-outline" size={14} color={C.subtext} />
              )}
            </View>

            <View style={styles.listTopGap} />
            {entries.map(renderEntry)}

            {!loading && count === 0 && (
              <Text style={styles.emptyText}>
                No Tickles tagged yet — tap the empty circle on any Tickle in your Tickle Stash to tag it here.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <PhotoEnlargeModal uri={enlargeUri} onDismiss={() => setEnlargeUri(null)} />
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  loader: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24 },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalDot: { width: 16, height: 16, borderRadius: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, flexShrink: 1 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  statusPill: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1 },
  statusPillActive: { backgroundColor: C.sparkleBg, borderColor: C.amberDark },
  statusPillAchieved: { backgroundColor: withAlpha(C.teal, 0.14), borderColor: C.teal },
  statusPillText: { fontSize: 11, fontWeight: '700', color: C.sparkleText },
  statusPillTextAchieved: { color: C.tealText },
  statusMeta: { fontSize: 12, color: C.subtext },

  listTopGap: { height: 18 },

  entryCard: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12 },
  entryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  entryNature: { fontSize: 12, fontWeight: '700', color: C.rustDark, flexShrink: 1, marginRight: 8 },
  entryDate: { fontSize: 12, color: C.subtext },
  entryPhotoStrip: {
    width: '100%', height: 140, borderRadius: 12, marginBottom: 8, backgroundColor: C.border,
  },
  entryPhotoSquare: {
    width: '100%', aspectRatio: 1, borderRadius: 12, marginBottom: 8, backgroundColor: C.border,
  },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },
});
