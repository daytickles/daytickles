import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { showAlert } from '../lib/themedAlert';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../lib/theme';
import { fetchMyTales, TALE_TITLE_MAX, TALE_BLURB_MAX } from '../lib/tales';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';

// Manage Tales -- the TickleTale counterpart to goals.js (migration
// 0067). Same create -> list -> complete/delete shape, minus the colour
// palette, the cap, and the token switch: Tales are uncapped by product
// decision, and Tale tagging never earns tokens. Complete mirrors
// Goals' Achieve (one-way, no reopen); a Completed Tale keeps its
// chapters but is closed to new ones.
export default function Tales() {
  const { session } = useAuth();
  const [tales, setTales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [blurb, setBlurb] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  // Same split as goals.js -- Complete/Delete share this, so completing
  // a Tale doesn't make the Start button read "Starting...".
  const [mutating, setMutating] = useState(false);

  const loadTales = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setTales(await fetchMyTales(session.user.id));
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadTales();
    }, [loadTales])
  );

  const ongoingTales = useMemo(() => tales.filter((t) => !t.completed_at), [tales]);
  const completedTales = useMemo(() => tales.filter((t) => t.completed_at), [tales]);

  async function handleAdd() {
    if (!title.trim()) {
      setStatus('Give your Tale a title.');
      return;
    }

    setSaving(true);
    setStatus('');

    const { error } = await supabase.from('tales').insert({
      user_id: session.user.id,
      title: title.trim(),
      blurb: blurb.trim() || null,
    });

    setSaving(false);

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setTitle('');
    setBlurb('');
    await loadTales();
  }

  function confirmComplete(tale) {
    showAlert(
      'Mark as complete?',
      `"${tale.title}" will show as Complete to everyone following it. Its Tics stay exactly as they are, but no new Tics can be added.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete', onPress: () => handleComplete(tale.id) },
      ]
    );
  }

  // Same mutating guard as goals.js's handleAchieve, same race: a
  // screen focused mid-flight could still offer the Tale as a tag target.
  async function handleComplete(id) {
    setMutating(true);
    const { error } = await supabase
      .from('tales')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', id);
    setMutating(false);
    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      await loadTales();
    }
  }

  function confirmDelete(tale) {
    showAlert(
      'Delete Tale?',
      `"${tale.title}" will be removed, along with its followers. Its Tics aren't deleted — they stay as regular Ripples, just no longer part of a Tale.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(tale.id) },
      ]
    );
  }

  async function handleDelete(id) {
    setMutating(true);
    const { error } = await supabase.from('tales').delete().eq('id', id);
    setMutating(false);
    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      await loadTales();
    }
  }

  function renderTale(item, isCompleted) {
    return (
      <View key={item.id} style={styles.taleCard}>
        <TouchableOpacity
          style={styles.taleRow}
          onPress={() => router.push({ pathname: '/tale', params: { id: item.id } })}
          disabled={mutating}
        >
          <Ionicons
            name={isCompleted ? 'checkmark-circle' : 'book-outline'}
            size={16}
            color={isCompleted ? C.subtext : C.rust}
            style={styles.taleIcon}
          />
          <View style={styles.taleText}>
            <Text style={[styles.taleTitle, isCompleted && styles.taleTitleCompleted]} numberOfLines={1}>
              {item.title}
            </Text>
            {!!item.blurb && <Text style={styles.taleBlurb} numberOfLines={2}>{item.blurb}</Text>}
          </View>
        </TouchableOpacity>
        <View style={styles.taleActions}>
          {!isCompleted && (
            <TouchableOpacity onPress={() => confirmComplete(item)} disabled={mutating}>
              <Text style={[styles.completeText, mutating && styles.linkDisabled]}>Complete</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => confirmDelete(item)} disabled={mutating}>
            <Text style={[styles.deleteText, mutating && styles.linkDisabled]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <WallpaperBackground>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity
        onPress={() => router.back()}
        disabled={saving || mutating}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={[styles.backLink, (saving || mutating) && styles.linkDisabled]}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Tell a Tale</Text>
      <Text style={styles.description}>
        A Tale is an experience that's bigger than a single Tickle — a string of moments, a weekend away, a
        special occasion, an adventure, or simply a collection of moments that belong together. Start one
        here, then add new Tics to it as they happen. Other users can then follow your Tale to see it
        unfold.
      </Text>

      {ongoingTales.map((item) => renderTale(item, false))}

      {!loading && tales.length === 0 && (
        <Text style={styles.empty}>No Tales yet — start one below.</Text>
      )}

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Title, e.g. Walking the Camino"
          placeholderTextColor={C.faint}
          value={title}
          onChangeText={setTitle}
          maxLength={TALE_TITLE_MAX}
        />
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="A short blurb (optional)"
          placeholderTextColor={C.faint}
          value={blurb}
          onChangeText={setBlurb}
          maxLength={TALE_BLURB_MAX}
          multiline
        />
        <Button
          title={saving ? 'Starting...' : 'Start Tale'}
          onPress={handleAdd}
          disabled={saving}
          variant="secondary"
        />
      </View>

      {!!status && <Text style={styles.status}>{status}</Text>}

      {completedTales.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Complete</Text>
          {completedTales.map((item) => renderTale(item, true))}
        </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  description: { fontSize: 13, color: C.subtext, lineHeight: 18, marginTop: 6, marginBottom: 16 },
  taleCard: {
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: C.card, borderRadius: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  taleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  taleIcon: { marginRight: 10, marginTop: 2 },
  taleText: { flex: 1 },
  taleTitle: { fontSize: 16, color: C.text },
  taleTitleCompleted: { color: C.subtext },
  taleBlurb: { fontSize: 13, color: C.subtext, marginTop: 2, lineHeight: 18 },
  taleActions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 8,
  },
  completeText: { color: C.tealText, fontWeight: '600' },
  deleteText: { color: C.rust, fontWeight: '600' },
  linkDisabled: { opacity: 0.4 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: C.subtext,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 16, marginBottom: 8,
  },
  empty: { color: C.subtext, fontStyle: 'italic', paddingVertical: 10 },
  form: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    padding: 10, marginBottom: 12, fontSize: 16,
    backgroundColor: C.card, color: C.text,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  status: { marginTop: 12, color: C.rust, textAlign: 'center' },
});
