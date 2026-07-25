import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, MOODS, accentFor, moodColorFor, darken, textOn } from '../lib/theme';
import Button from '../components/Button';

const MAX_LEN = 500;

// Presentation only — not shared elsewhere, so kept local rather than
// added to lib/theme.js alongside MOODS.
const TICKLE_NATURE_OPTIONS = [
  { id: 'received', label: 'Made me Smile' },
  { id: 'given', label: 'I paid forward' },
  { id: 'self', label: 'Mood boost' },
];

export default function Create() {
  const { session, profile } = useAuth();
  const { entryId } = useLocalSearchParams();
  const accent = accentFor(profile?.accent_theme);
  const accentDark = darken(accent.card, 0.35);
  const accentDarkText = textOn(accentDark);

  const [text, setText] = useState('');
  const [mood, setMood] = useState(null);
  const [tickleNature, setTickleNature] = useState(null);
  const [shareToFeed, setShareToFeed] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(!!entryId);

  // Edit mode: seed every field from the existing row, including
  // shareToFeed from its actual current visibility rather than leaving
  // it at the blank-state default of false — otherwise saving an edit
  // to an already-public entry would silently flip it back to private.
  useEffect(() => {
    if (!entryId) return;

    (async () => {
      const { data, error } = await supabase
        .from('tickle_entries')
        .select('text_content, mood, tickle_nature, visibility')
        .eq('id', entryId)
        .single();

      if (!error && data) {
        setText(data.text_content);
        setMood(data.mood);
        setTickleNature(data.tickle_nature);
        setShareToFeed(data.visibility === 'public');
      }
      setLoadingEntry(false);
    })();
  }, [entryId]);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus('Write a little about what made you smile.');
      return;
    }
    if (!mood) {
      setStatus('Pick how big the smile was.');
      return;
    }

    setSaving(true);
    setStatus('');

    // Edit mode: explicit field list, never a full-object update — so
    // goal_id, like_count, and entry_date (the original date is kept on
    // purpose, never stamped to today) are never touched. is_edited
    // isn't part of the fields this screen otherwise "owns," but it's
    // the only way the resulting "(edited)" label can survive a reload
    // on Home/Feed, since there's no updated_at on this table.
    const { error } = entryId
      ? await supabase
          .from('tickle_entries')
          .update({
            text_content: trimmed,
            mood,
            tickle_nature: tickleNature,
            visibility: shareToFeed ? 'public' : 'private',
            is_edited: true,
          })
          .eq('id', entryId)
      : await supabase.from('tickle_entries').insert({
          user_id: session.user.id,
          entry_date: new Date().toISOString().slice(0, 10),
          text_content: trimmed,
          mood,
          tickle_nature: tickleNature,
          visibility: shareToFeed ? 'public' : 'private',
        });

    setSaving(false);

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    router.back();
  }

  if (loadingEntry) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator color={accentDark} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{entryId ? 'Edit your tickle' : 'What made you smile today?'}</Text>

      <TextInput
        style={styles.input}
        placeholder="Tell us about it..."
        placeholderTextColor={C.faint}
        value={text}
        onChangeText={(t) => setText(t.slice(0, MAX_LEN))}
        maxLength={MAX_LEN}
        multiline
        textAlignVertical="top"
      />
      <Text style={styles.counter}>{text.length}/{MAX_LEN}</Text>

      <Text style={styles.label}>How big was the Buzz?</Text>
      <View style={styles.moodRow}>
        {MOODS.map((m) => {
          const size = m.size + 12;
          const color = moodColorFor(m.id, accent);
          const selected = mood === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => setMood(m.id)}
              style={styles.moodOption}
            >
              <View
                style={[
                  styles.moodDot,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                    borderColor: selected ? accentDark : 'transparent',
                  },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
      {mood && <Text style={styles.moodLabel}>{MOODS.find((m) => m.id === mood).label}</Text>}

      {profile?.tickle_nature_enabled && (
        <>
          <Text style={styles.label}>What kind of tickle was it?</Text>
          <View style={styles.natureRow}>
            {TICKLE_NATURE_OPTIONS.map((opt) => {
              const selected = tickleNature === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setTickleNature(selected ? null : opt.id)}
                  style={[
                    styles.natureOption,
                    selected && { backgroundColor: accentDark, borderColor: accentDark },
                  ]}
                >
                  <Text style={[styles.natureOptionLabel, selected && { color: accentDarkText }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.shareRow}>
        <Text style={styles.label}>Share to feed</Text>
        <Switch
          value={shareToFeed}
          onValueChange={setShareToFeed}
          trackColor={{ false: C.border, true: accentDark }}
          thumbColor={C.card}
        />
      </View>

      <Button
        title={saving ? 'Saving...' : 'Save'}
        onPress={handleSave}
        disabled={saving}
        variant="primary"
      />
      {!!status && <Text style={styles.status}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: C.bg },
  loadingContainer: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: C.rustDark },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    padding: 12, minHeight: 120, fontSize: 16,
    backgroundColor: C.card, color: C.text,
  },
  counter: { alignSelf: 'flex-end', color: C.subtext, fontSize: 12, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 14, color: C.subtext },
  moodRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, marginTop: 12, marginBottom: 8, height: 50,
  },
  moodOption: { alignItems: 'center', justifyContent: 'center', width: 50, height: 50 },
  moodDot: { borderWidth: 3 },
  moodLabel: { textAlign: 'center', color: C.text, marginBottom: 20 },
  natureRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 20 },
  natureOption: {
    flex: 1, paddingVertical: 10, borderRadius: 20,
    alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  natureOptionLabel: { fontSize: 12, fontWeight: '600', color: C.subtext, textAlign: 'center' },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 28,
  },
  status: { marginTop: 12, color: C.rust, textAlign: 'center' },
});
