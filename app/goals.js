import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert, Keyboard,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, GOAL_COLORS, MAX_GOALS, accentFor, darken } from '../lib/theme';
import Button from '../components/Button';

export default function Goals() {
  const { session, profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      setStatus(`Error loading goals: ${error.message}`);
    } else {
      setGoals(data);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [loadGoals])
  );

  const usedColors = useMemo(() => new Set(goals.map((g) => g.color)), [goals]);

  // Keep the pending new-goal color off of whatever's already taken —
  // existing goals' colors are never touched, only the not-yet-saved
  // selection for the next one.
  useEffect(() => {
    if (usedColors.has(color)) {
      const nextAvailable = GOAL_COLORS.find((c) => !usedColors.has(c));
      if (nextAvailable) setColor(nextAvailable);
    }
  }, [usedColors]);

  async function handleAdd() {
    if (!label.trim()) {
      setStatus('Enter a goal name.');
      return;
    }
    if (goals.length >= MAX_GOALS) {
      setStatus(`Limit reached (${MAX_GOALS} max).`);
      return;
    }

    setSaving(true);
    setStatus('');

    const { error } = await supabase.from('goals').insert({
      user_id: session.user.id,
      label: label.trim(),
      color,
    });

    setSaving(false);

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setLabel('');
    setColor(GOAL_COLORS[0]);
    await loadGoals();
  }

  function confirmDelete(goal) {
    Alert.alert(
      'Delete goal?',
      `"${goal.label}" will be removed. Entries tagged with it will just lose the tag.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(goal.id) },
      ]
    );
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      await loadGoals();
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.backLink}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Your Goals</Text>
      <Text style={styles.subtitle}>{goals.length}/{MAX_GOALS} used</Text>

      <FlatList
        data={goals}
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={styles.goalRow}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.goalLabel}>{item.label}</Text>
            <TouchableOpacity onPress={() => confirmDelete(item)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          !loading && <Text style={styles.empty}>No goals yet — add one below.</Text>
        }
      />

      {goals.length < MAX_GOALS && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="e.g. Travel to work"
            placeholderTextColor={C.faint}
            value={label}
            onChangeText={setLabel}
            maxLength={60}
          />

          <View style={styles.paletteRow}>
            {GOAL_COLORS.map((c) => {
              const isUsed = usedColors.has(c);
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => {
                    Keyboard.dismiss();
                    setColor(c);
                  }}
                  disabled={isUsed}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    color === c && { borderColor: accentDark },
                    isUsed && styles.swatchDisabled,
                  ]}
                />
              );
            })}
          </View>

          <Button
            title={saving ? 'Adding...' : 'Add Goal'}
            onPress={handleAdd}
            disabled={saving}
            variant="primary"
          />
        </View>
      )}

      {!!status && <Text style={styles.status}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: C.bg },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  subtitle: { color: C.subtext, marginBottom: 16 },
  list: { flexGrow: 0, marginBottom: 20 },
  goalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: C.card, borderRadius: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  dot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  goalLabel: { flex: 1, fontSize: 16, color: C.text },
  deleteText: { color: C.rust, fontWeight: '600' },
  empty: { color: C.subtext, fontStyle: 'italic', paddingVertical: 10 },
  form: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    padding: 10, marginBottom: 12, fontSize: 16,
    backgroundColor: C.card, color: C.text,
  },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  swatch: {
    width: 36, height: 36, borderRadius: 18, margin: 4,
    borderWidth: 3, borderColor: 'transparent',
  },
  swatchDisabled: { opacity: 0.25 },
  status: { marginTop: 12, color: C.rust, textAlign: 'center' },
});
