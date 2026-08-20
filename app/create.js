import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Platform, Keyboard,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, MOODS, MOOD_DOT_SIZE, accentFor, moodColorFor, moodBorderColor, withAlpha, darken, textOn } from '../lib/theme';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';
import { linkPhotoToEntry } from '../lib/pinBoardDb';
import { localDateString } from '../lib/week';

const MAX_LEN = 500;

// Presentation only — not shared elsewhere, so kept local rather than
// added to lib/theme.js alongside MOODS.
const TICKLE_NATURE_OPTIONS = [
  { id: 'received', label: 'Made me Smile' },
  { id: 'given', label: 'I paid forward' },
  { id: 'self', label: 'Mood boost' },
];

const DAY_JOURNAL_OPTION = { id: 'day_journal', label: 'Day Journal' };

export default function Create() {
  const { session, profile, getNextPrompt } = useAuth();
  const { entryId, pinnedPhotoId } = useLocalSearchParams();
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
  // Picked once at mount, not re-rolled on every render, so it doesn't
  // change while the user is still deciding what to write (same
  // deterministic-not-jarring instinct as PolaroidCard's tilt).
  const [prompt] = useState(() => getNextPrompt?.() ?? null);
  const isEmpty = text.trim().length === 0;

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
      setStatus('Pick how bright the buzz was.');
      return;
    }
    // Create-only -- an existing entry saved before this became required
    // (or edited just to fix a typo) shouldn't retroactively block on a
    // missing vibe. entryId is the same signal handleSave already uses
    // below to branch insert vs. update.
    if (!entryId && !tickleNature) {
      setStatus('Pick a tickle vibe.');
      return;
    }

    setSaving(true);
    setStatus('');

    let savedEntryId = entryId;
    let error;

    if (entryId) {
      // Edit mode: explicit field list, never a full-object update — so
      // goal_id, like_count, and entry_date (the original date is kept on
      // purpose, never stamped to today) are never touched. is_edited
      // isn't part of the fields this screen otherwise "owns," but it's
      // the only way the resulting "(edited)" label can survive a reload
      // on Home/Feed, since there's no updated_at on this table.
      ({ error } = await supabase
        .from('tickle_entries')
        .update({
          text_content: trimmed,
          mood,
          tickle_nature: tickleNature,
          visibility: shareToFeed ? 'public' : 'private',
          is_edited: true,
        })
        .eq('id', entryId));
    } else {
      const insertResult = await supabase
        .from('tickle_entries')
        .insert({
          user_id: session.user.id,
          entry_date: localDateString(),
          text_content: trimmed,
          mood,
          tickle_nature: tickleNature,
          visibility: shareToFeed ? 'public' : 'private',
        })
        .select('id')
        .single();
      error = insertResult.error;
      savedEntryId = insertResult.data?.id;
    }

    if (error) {
      setSaving(false);
      setStatus(`Error: ${error.message}`);
      return;
    }

    // The Pin Board link is local-only — never a field on the synced
    // row itself (see lib/pinBoardDb.js) — so it's created here, after
    // the save succeeds, rather than passed as part of the insert.
    if (pinnedPhotoId && savedEntryId) {
      await linkPhotoToEntry(session.user.id, Number(pinnedPhotoId), savedEntryId);
    }

    setSaving(false);
    router.back();
  }

  if (loadingEntry) {
    return (
      <WallpaperBackground>
        <View style={[styles.container, styles.loadingContainer]}>
          <ActivityIndicator color={accentDark} />
        </View>
      </WallpaperBackground>
    );
  }

  // The nature picker (Made me Smile / I paid forward / Mood boost)
  // always shows now -- tickle_nature_enabled's gating was removed. Day
  // Journal keeps its own independent opt-in toggle, contributing a 4th
  // option into the same single-select tickle_nature field.
  const baseNatureOptions = TICKLE_NATURE_OPTIONS;
  const showDayJournal = !!profile?.day_journal_enabled;
  const dayJournalSelected = tickleNature === DAY_JOURNAL_OPTION.id;

  return (
    <WallpaperBackground>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.backLink}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{entryId ? 'Edit your tickle' : 'What made you smile today?'}</Text>
      {!!pinnedPhotoId && <Text style={styles.photoLinkHint}>📌 Linking to your pinned photo</Text>}
      {isEmpty && !!prompt && (
        <View style={styles.promptHintRow}>
          <Ionicons name="bulb" size={14} color={C.amberBg} />
          <Text style={styles.promptHint}>{prompt}</Text>
        </View>
      )}

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(t) => setText(t.slice(0, MAX_LEN))}
        maxLength={MAX_LEN}
        multiline
        textAlignVertical="top"
      />
      <Text style={styles.counter}>{text.length}/{MAX_LEN}</Text>

      <Text style={styles.label}>How bright was the buzz?</Text>
      <View style={styles.moodRow}>
        {MOODS.map((m) => {
          const color = moodColorFor(m.id, accent);
          const base = moodBorderColor(accent);
          const selected = mood === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => {
                Keyboard.dismiss();
                setMood(m.id);
              }}
              style={styles.moodOption}
            >
              <View
                style={{
                  width: MOOD_DOT_SIZE,
                  height: MOOD_DOT_SIZE,
                  borderRadius: MOOD_DOT_SIZE / 2,
                  backgroundColor: color,
                  // Border color/weight signal selection; the fill
                  // above is untouched by selection state -- it only
                  // ever encodes mood intensity.
                  borderColor: selected ? base : withAlpha(base, 0.5),
                  borderWidth: selected ? 3 : 1.5,
                }}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {(baseNatureOptions.length > 0 || showDayJournal) && (
        <>
          <Text style={styles.label}>Pick your Vibe.</Text>
          {baseNatureOptions.length > 0 && (
            <View style={styles.natureRow}>
              {baseNatureOptions.map((opt) => {
                const selected = tickleNature === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      Keyboard.dismiss();
                      setTickleNature(selected ? null : opt.id);
                    }}
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
          )}
          {showDayJournal && (
            <View style={styles.natureRowSingle}>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setTickleNature(dayJournalSelected ? null : DAY_JOURNAL_OPTION.id);
                }}
                style={[
                  styles.natureOption,
                  styles.natureOptionCentered,
                  dayJournalSelected && { backgroundColor: accentDark, borderColor: accentDark },
                ]}
              >
                <Text style={[styles.natureOptionLabel, dayJournalSelected && { color: accentDarkText }]}>
                  {DAY_JOURNAL_OPTION.label}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <View style={styles.shareRow}>
        <Text style={styles.label}>Ripple your vibe – Share it!</Text>
        <Switch
          value={shareToFeed}
          onValueChange={setShareToFeed}
          trackColor={{ false: C.border, true: accentDark }}
          thumbColor={C.card}
        />
      </View>

      {!!status && <Text style={styles.status}>{status}</Text>}
      <Button
        title={saving ? 'Saving...' : 'Save'}
        onPress={handleSave}
        disabled={saving}
        variant="primary"
      />
    </ScrollView>
    </KeyboardAvoidingView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  loadingContainer: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: C.rustDark },
  photoLinkHint: { fontSize: 13, color: C.subtext, marginTop: -12, marginBottom: 12 },
  promptHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  promptHint: { fontSize: 14, fontStyle: 'italic', color: C.subtext },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    padding: 12, minHeight: 120, fontSize: 16,
    backgroundColor: C.card, color: C.text,
  },
  counter: { alignSelf: 'flex-end', color: C.subtext, fontSize: 12, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 14, color: C.subtext },
  moodRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, marginTop: 12, marginBottom: 28, height: 50,
  },
  moodOption: { alignItems: 'center', justifyContent: 'center', width: 50, height: 50 },
  natureRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 20 },
  natureRowSingle: { flexDirection: 'row', justifyContent: 'center', marginTop: 8, marginBottom: 20 },
  natureOption: {
    flex: 1, paddingVertical: 10, borderRadius: 20,
    alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  natureOptionCentered: { flex: 0, paddingHorizontal: 20 },
  natureOptionLabel: { fontSize: 12, fontWeight: '600', color: C.subtext, textAlign: 'center' },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 28,
  },
  status: { marginBottom: 12, color: C.error, textAlign: 'center' },
});
