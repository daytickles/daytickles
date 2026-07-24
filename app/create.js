import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { router } from 'expo-router';
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
  const accent = accentFor(profile?.accent_theme);
  const accentDark = darken(accent.card, 0.35);
  const accentDarkText = textOn(accentDark);

  const [text, setText] = useState('');
  const [mood, setMood] = useState(null);
  const [tickleNature, setTickleNature] = useState(null);
  const [shareToFeed, setShareToFeed] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

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

    const { error } = await supabase.from('tickle_entries').insert({
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What made you smile today?</Text>

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
