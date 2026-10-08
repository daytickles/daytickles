import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Keyboard,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { showAlert } from '../lib/themedAlert';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, GOAL_COLORS, accentFor, darken, lighten } from '../lib/theme';
import { capFor } from '../lib/freemiumCaps';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';

// goals.weekly_target (migration 0072): the value the Switch turns on
// with, and a client-side ceiling (the DB only checks >= 1).
const DEFAULT_WEEKLY_TARGET = 3;
const MAX_WEEKLY_TARGET = 99;

export default function Goals() {
  const { session, profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [earnsTokens, setEarnsTokens] = useState(false);
  // null = no weekly target (the Switch is off), else 1..MAX_WEEKLY_TARGET.
  const [weeklyTarget, setWeeklyTarget] = useState(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  // Keyed per-goal so toggling one goal's earns_tokens Switch doesn't
  // disable every other row's Switch while its own write is in flight.
  const [savingEarnsTokensId, setSavingEarnsTokensId] = useState(null);
  // Same per-goal keying for the weekly target row -- disables that row's
  // Switch and stepper together, so fast taps can't race two writes.
  const [savingWeeklyTargetId, setSavingWeeklyTargetId] = useState(null);
  // Separate from `saving` (which is specifically the Add Goal button's
  // own state, unchanged below) -- shared between Achieve and Delete
  // only, so achieving one goal doesn't make the Add Goal button
  // misleadingly show "Adding..." (confirmed on-device: reusing
  // `saving` for this did exactly that).
  const [mutating, setMutating] = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false });

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

  const activeGoals = useMemo(() => goals.filter((g) => !g.achieved_at), [goals]);
  // Age-tiered active-goal ceiling (lib/freemiumCaps.js) -- MAX_GOALS in
  // month 1, then 4/2/1. Only active goals count; an account already
  // over a lower tier keeps its goals, it just can't add more.
  const goalCap = profile ? capFor(profile, 'activeGoals') : 0;
  const achievedGoals = useMemo(() => goals.filter((g) => g.achieved_at), [goals]);

  // Only active goals reserve a swatch — achieving a goal frees its
  // color for reuse, same as it frees its slot against goalCap above.
  const usedColors = useMemo(() => new Set(activeGoals.map((g) => g.color)), [activeGoals]);

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
    if (activeGoals.length >= goalCap) {
      setStatus(`Limit reached (${goalCap} max).`);
      return;
    }

    setSaving(true);
    setStatus('');

    // weekly_target is only sent when set, so Add Goal keeps working
    // even against a database that doesn't have migration 0072 yet.
    const { error } = await supabase.from('goals').insert({
      user_id: session.user.id,
      label: label.trim(),
      color,
      earns_tokens: earnsTokens,
      ...(weeklyTarget != null && { weekly_target: weeklyTarget }),
    });

    setSaving(false);

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setLabel('');
    setColor(GOAL_COLORS[0]);
    setEarnsTokens(false);
    setWeeklyTarget(null);
    await loadGoals();
  }

  // Optimistic, like handleAdd/handleAchieve/handleDelete above -- not
  // gated behind the shared `mutating` flag, since toggling
  // earns_tokens doesn't remove or add a goal from the assignable list
  // (the race those two guard against), only flips a boolean on one
  // that's already there.
  async function handleToggleEarnsTokens(goal, value) {
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, earns_tokens: value } : g)));
    setSavingEarnsTokensId(goal.id);
    const { error } = await supabase.from('goals').update({ earns_tokens: value }).eq('id', goal.id);
    setSavingEarnsTokensId(null);
    if (error) {
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, earns_tokens: !value } : g)));
      setStatus(`Error: ${error.message}`);
    }
  }

  // Same optimistic shape as handleToggleEarnsTokens, but rolls back to
  // the goal's previous value rather than a negation, since this isn't a
  // boolean. null = Switch off. Only goals.weekly_target is written --
  // reaching the target is derived on Home/goal.js, never stored, and
  // has nothing to do with tokens.
  async function handleSetWeeklyTarget(goal, value) {
    const previous = goal.weekly_target ?? null;
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, weekly_target: value } : g)));
    setSavingWeeklyTargetId(goal.id);
    const { error } = await supabase.from('goals').update({ weekly_target: value }).eq('id', goal.id);
    setSavingWeeklyTargetId(null);
    if (error) {
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, weekly_target: previous } : g)));
      setStatus(`Error: ${error.message}`);
    }
  }

  // Shared by the new-goal form and each active Goal card. The stepper
  // (markup copied from Settings' Weekly Vibe Targets) only appears while
  // the Switch is on, never goes below 1, and is clamped at
  // MAX_WEEKLY_TARGET -- only the Switch turns the target off.
  function renderWeeklyTargetRow(value, onChange, disabled) {
    return (
      <View style={styles.goalTokenRow}>
        <Text style={styles.goalTokenLabel}>Weekly target</Text>
        <View style={styles.weeklyTargetControls}>
          {value != null && (
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => onChange(Math.max(1, value - 1))}
                disabled={disabled || value <= 1}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="remove-circle-outline" size={20} color={value > 1 ? C.text : C.faint} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{value}</Text>
              <TouchableOpacity
                onPress={() => onChange(Math.min(MAX_WEEKLY_TARGET, value + 1))}
                disabled={disabled || value >= MAX_WEEKLY_TARGET}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color={value < MAX_WEEKLY_TARGET ? C.text : C.faint}
                />
              </TouchableOpacity>
            </View>
          )}
          <Switch
            value={value != null}
            onValueChange={(on) => onChange(on ? DEFAULT_WEEKLY_TARGET : null)}
            disabled={disabled}
            trackColor={{ false: C.border, true: accentDark }}
            thumbColor={C.card}
          />
        </View>
      </View>
    );
  }

  function confirmAchieve(goal) {
    showAlert(
      'Mark as achieved?',
      `"${goal.label}" moves to your achieved goals. Entries already tagged with it keep the tag (shown faded with a check), and the slot frees up for a new goal.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Achieve', onPress: () => handleAchieve(goal.id) },
      ]
    );
  }

  // mutating is set for the whole round-trip -- without it, nothing
  // stopped a fast tap on "‹ Back" (or another row's Achieve/Delete)
  // between confirming this Alert and the update actually committing.
  // A screen navigated to in that gap (e.g. Tickle Stash's own
  // independent goals fetch on focus) could read the pre-achieve row
  // and briefly offer it as a selectable tag target -- a real,
  // confirmed-possible race, not a fetch/filter bug on the other end.
  async function handleAchieve(id) {
    setMutating(true);
    const { error } = await supabase
      .from('goals')
      .update({ achieved_at: new Date().toISOString() })
      .eq('id', id);
    setMutating(false);
    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      await loadGoals();
    }
  }

  function confirmDelete(goal) {
    showAlert(
      'Delete goal?',
      `"${goal.label}" will be removed. Entries tagged with it will just lose the tag.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(goal.id) },
      ]
    );
  }

  // Same mutating guard as handleAchieve, same reason -- a delete has
  // the identical race shape (a screen focused mid-flight could still
  // see the now-gone goal as taggable).
  async function handleDelete(id) {
    setMutating(true);
    const { error } = await supabase.from('goals').delete().eq('id', id);
    setMutating(false);
    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      await loadGoals();
    }
  }

  return (
    <WallpaperBackground>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* disabled (not just visually dimmed) while ANY goals mutation on
          this screen is in flight -- Add (saving) or Achieve/Delete
          (mutating) -- see handleAchieve/handleDelete's own comments for
          the race this closes. TouchableOpacity's disabled prop
          genuinely blocks onPress, so this isn't cosmetic. */}
      <TouchableOpacity
        onPress={() => router.back()}
        disabled={saving || mutating}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={[styles.backLink, (saving || mutating) && styles.linkDisabled]}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>My Goals</Text>
      <Text style={styles.description}>
        Add a goal and choose a colour to represent it. That colour will mark all Tickles linked to this goal.
      </Text>
      <Text style={styles.subtitle}>{activeGoals.length}/{goalCap} used</Text>

      {activeGoals.map((item) => (
        <View key={item.id} style={styles.goalCard}>
          <View style={styles.goalRow}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.goalLabel}>{item.label}</Text>
            <View style={styles.goalActions}>
              <TouchableOpacity onPress={() => confirmAchieve(item)} disabled={mutating}>
                <Text style={[styles.achieveText, mutating && styles.linkDisabled]}>Achieve</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete(item)} disabled={mutating}>
                <Text style={[styles.deleteText, mutating && styles.linkDisabled]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.goalTokenRow}>
            <Text style={styles.goalTokenLabel}>Earns tokens</Text>
            <Switch
              value={!!item.earns_tokens}
              onValueChange={(value) => handleToggleEarnsTokens(item, value)}
              disabled={savingEarnsTokensId === item.id}
              trackColor={{ false: C.border, true: accentDark }}
              thumbColor={C.card}
            />
          </View>
          {renderWeeklyTargetRow(
            item.weekly_target ?? null,
            (value) => handleSetWeeklyTarget(item, value),
            savingWeeklyTargetId === item.id
          )}
        </View>
      ))}

        {!loading && activeGoals.length === 0 && achievedGoals.length === 0 && (
          <Text style={styles.empty}>No goals yet — add one below.</Text>
        )}

      {/* The form is hidden at the cap, so handleAdd's own "Limit
          reached" status could never actually show -- this says why the
          form is gone instead, in the same inline status style. Gated on
          !loading and profile so a not-yet-loaded goalCap of 0 never
          flashes "(0 max)". */}
      {!loading && !!profile && activeGoals.length >= goalCap && (
        <Text style={styles.status}>
          Limit reached ({goalCap} max). Achieve or delete a goal to add a new one.
        </Text>
      )}

      {activeGoals.length < goalCap && (
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

          <View style={styles.goalTokenRow}>
            <Text style={styles.goalTokenLabel}>Earns tokens</Text>
            <Switch
              value={earnsTokens}
              onValueChange={setEarnsTokens}
              trackColor={{ false: C.border, true: accentDark }}
              thumbColor={C.card}
            />
          </View>

          {renderWeeklyTargetRow(weeklyTarget, setWeeklyTarget, false)}

          <Button
            title={saving ? 'Adding...' : 'Add Goal'}
            onPress={handleAdd}
            disabled={saving}
            variant="secondary"
          />
        </View>
      )}

      {!!status && <Text style={styles.status}>{status}</Text>}

      {achievedGoals.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Achieved</Text>
          {achievedGoals.map((item) => (
            <View key={item.id} style={styles.goalCard}>
              <View style={styles.goalRow}>
                <View style={[styles.dot, styles.dotAchieved, { backgroundColor: lighten(item.color, 0.6) }]}>
                  <Ionicons name="checkmark" size={10} color={darken(item.color, 0.4)} />
                </View>
                <Text style={[styles.goalLabel, styles.goalLabelAchieved]}>{item.label}</Text>
                <View style={styles.goalActions}>
                  <TouchableOpacity onPress={() => confirmDelete(item)} disabled={mutating}>
                    <Text style={[styles.deleteText, mutating && styles.linkDisabled]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
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
  description: { fontSize: 13, color: C.subtext, lineHeight: 18, marginTop: 6 },
  subtitle: { color: C.subtext, marginBottom: 16 },
  goalCard: {
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: C.card, borderRadius: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  goalRow: { flexDirection: 'row', alignItems: 'center' },
  goalTokenRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border,
  },
  goalTokenLabel: { fontSize: 13, color: C.subtext },
  weeklyTargetControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Copied from app/settings.js's stepper/stepperValue.
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperValue: { fontSize: 15, fontWeight: '600', color: C.text, minWidth: 28, textAlign: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  dotAchieved: { alignItems: 'center', justifyContent: 'center' },
  goalLabel: { flex: 1, fontSize: 16, color: C.text },
  goalLabelAchieved: { color: C.subtext },
  goalActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  achieveText: { color: C.tealText, fontWeight: '600' },
  deleteText: { color: C.rust, fontWeight: '600' },
  linkDisabled: { opacity: 0.4 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: C.subtext,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 4, marginBottom: 8,
  },
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
