// app/quick-quest.js
//
// Quick Quest: a small thing to try, opened from Home's dice button. One
// screen with an internal step:
//   pick   -- how long, what kind, "Use this every time"
//   prompt -- the quest, with an optional countdown
//   count  -- the countdown running (nothing rings, nothing vibrates)
//   three  -- "Notice three things", three tick rows and an optional countdown
//   done   -- Save it (+1 token, given by the database trigger) or keep it
//   keep   -- write a line and keep it as a private Tickle
// Nothing is saved until Save it or Keep as a Tickle. A quest is saved at
// most once (questId), so a retried Keep never makes a second quest.
//
// The countdown works from an end timestamp, re-read every 250 ms and
// when the app comes back to the foreground, so it stays right after the
// phone sleeps. The clock's spoken label changes about every 10 seconds;
// nothing is announced while it runs.
//
// Data and prompts: lib/quickQuests.js. The "seen" list and the "Use this
// every time" choice are on this phone (AsyncStorage).

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch,
  AppState, AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { localDateString } from '../lib/week';
import { C, NATURE_ORDER, NATURE_LABELS, VIBE_CARD_PALETTES } from '../lib/theme';
import WallpaperBackground from '../components/WallpaperBackground';
import {
  QUEST_KINDS, QUEST_TIMES, QUEST_TIME_ANY,
  pickQuest, pickNoticeThree, defaultVibeFor, minutesLabel, kindLabel,
  loadSeen, saveSeen, loadEveryTime, saveEveryTime, clearEveryTime,
  saveQuickQuest, linkQuestToEntry,
} from '../lib/quickQuests';

const DUSK = '#425762';
const CREAM = '#FFF8EC';
const CARD = '#FFFDF7';
const MUTED = '#6B675E';
// The muted Vibe colours (Made me smile / Paying forward / For me).
const VIBE_FILL = VIBE_CARD_PALETTES.muted.colors;

// Same limit as New Tickle (app/create.js).
const NOTE_MAX_LEN = 500;
const CONFIRM_MS = 1200;
const TICK_MS = 250;
const DEFAULT_MAX_MINUTES = 2;
const NOTICE_THREE_KIND = 'notice_three';
const NOTICE_THREE_MINUTES = 2;
const THREE_ROWS = ['First thing', 'Second thing', 'Third thing'];

const TIME_CHIPS = [
  ...QUEST_TIMES.map((m) => ({ value: m, label: `${m} min` })),
  { value: QUEST_TIME_ANY, label: 'Any' },
];
const KIND_CHIPS = [
  { key: 'any', label: 'Anything', hint: 'Any of the five kinds.' },
  ...QUEST_KINDS,
];

function questKindLabel(kind) {
  return kind === NOTICE_THREE_KIND ? 'Notice three things' : kindLabel(kind) || '';
}

// "a Notice", "an Explore". notice_three is suggested as a Notice.
function withArticle(kind) {
  const label = kind === NOTICE_THREE_KIND ? 'Notice' : kindLabel(kind) || '';
  return /^[AEIOU]/.test(label) ? `an ${label}` : `a ${label}`;
}

function clockText(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// The clock's spoken label, rounded up to the next 10 seconds so it only
// changes about every 10 seconds.
function spokenRemaining(totalSeconds) {
  const rounded = Math.ceil(totalSeconds / 10) * 10;
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  const parts = [];
  if (m > 0) parts.push(m === 1 ? '1 minute' : `${m} minutes`);
  if (s > 0 || m === 0) parts.push(`${s} seconds`);
  return `Countdown, about ${parts.join(' ')} left`;
}

function PrimaryButton({ title, onPress, disabled, tokenPill }) {
  return (
    <TouchableOpacity
      style={[styles.primaryButton, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={tokenPill ? `${title}, plus 1 token` : title}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
      {tokenPill && (
        <View style={styles.tokenPill}>
          <Text style={styles.tokenPillText}>+1 token</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function OutlineButton({ title, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.outlineButton, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={styles.outlineButtonText}>{title}</Text>
    </TouchableOpacity>
  );
}

function QuietButton({ title, onPress, disabled, link }) {
  return (
    <TouchableOpacity
      style={styles.quietButton}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={link ? 'link' : 'button'}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={[styles.quietButtonText, link && styles.linkText, disabled && styles.quietDisabled]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Tag({ text }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{text}</Text>
    </View>
  );
}

export default function QuickQuest() {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const params = useLocalSearchParams();
  const changeParam = Array.isArray(params.change) ? params.change[0] : params.change;
  const insets = useSafeAreaInsets();
  // Same "!== false" idiom as Home: unknown counts as on.
  const tokensOn = profile?.tokens_enabled !== false;

  const [ready, setReady] = useState(false);
  const [step, setStep] = useState('pick');
  const [kind, setKind] = useState('any');
  const [maxMinutes, setMaxMinutes] = useState(DEFAULT_MAX_MINUTES);
  const [everyTime, setEveryTime] = useState(false);
  const [message, setMessage] = useState('');
  // The quest on screen: a QUEST_PROMPTS or NOTICE_THREE item, and its
  // kind (a QUEST_KINDS key or 'notice_three').
  const [prompt, setPrompt] = useState(null);
  const [questKind, setQuestKind] = useState(null);
  // Countdown: end time (ms) while running, else null.
  const [endAt, setEndAt] = useState(null);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [checks, setChecks] = useState([false, false, false]);
  // Saved quest id (once saved, never saved again), busy while saving or
  // while the confirmation shows.
  const [questId, setQuestId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [note, setNote] = useState('');
  const [vibe, setVibe] = useState(null);

  const seenRef = useRef([]);
  const confirmTimer = useRef(null);
  const started = useRef(false);

  function rememberSeen(next) {
    seenRef.current = next;
    if (userId) saveSeen(userId, next);
  }

  function resetQuestState() {
    setEndAt(null);
    setTimeUp(false);
    setChecks([false, false, false]);
    setQuestId(null);
    setNote('');
    setMessage('');
  }

  function showQuest(nextPrompt, nextKind) {
    resetQuestState();
    setPrompt(nextPrompt);
    setQuestKind(nextKind);
    setVibe(defaultVibeFor(nextKind));
  }

  // Mount: the seen list and any saved "every time" choice. With a saved
  // choice (and not opened to change it), straight to a quest.
  useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;
    (async () => {
      const [seen, saved] = await Promise.all([loadSeen(userId), loadEveryTime(userId)]);
      seenRef.current = seen;
      if (saved) {
        setKind(saved.kind);
        setMaxMinutes(saved.maxMinutes);
        setEveryTime(true);
        if (changeParam !== '1') {
          const result = pickQuest({ kind: saved.kind, maxMinutes: saved.maxMinutes, seen });
          if (result.prompt) {
            rememberSeen(result.seen);
            showQuest(result.prompt, result.prompt.kind);
            setStep('prompt');
          }
        }
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  // The countdown. Re-reads the end time on a 250 ms interval and when
  // the app returns to the foreground; at 0 it stops and shows "Time is up".
  useEffect(() => {
    if (!endAt) return undefined;
    let intervalId = null;
    function tick() {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0) {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
        setEndAt(null);
        setTimeUp(true);
        setStep('done');
      }
    }
    tick();
    intervalId = setInterval(tick, TICK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      if (intervalId) clearInterval(intervalId);
      sub.remove();
    };
  }, [endAt]);

  function startCountdown(minutes) {
    const seconds = minutes * 60;
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setTimeUp(false);
    setEndAt(Date.now() + seconds * 1000);
  }

  function stopCountdown() {
    setEndAt(null);
  }

  function leave() {
    stopCountdown();
    router.back();
  }

  function saveChoice() {
    if (!userId) return;
    if (everyTime) saveEveryTime(userId, { kind, maxMinutes });
    else clearEveryTime(userId);
  }

  function handleGiveQuest() {
    saveChoice();
    const result = pickQuest({ kind, maxMinutes, seen: seenRef.current });
    if (!result.prompt) {
      setMessage('Nothing fits that yet. Try a longer time.');
      return;
    }
    rememberSeen(result.seen);
    showQuest(result.prompt, result.prompt.kind);
    setStep('prompt');
  }

  function handleNoticeThree() {
    saveChoice();
    const result = pickNoticeThree({ seen: seenRef.current });
    if (!result.prompt) return;
    rememberSeen(result.seen);
    showQuest(result.prompt, NOTICE_THREE_KIND);
    setStep('three');
  }

  function handleAnother() {
    stopCountdown();
    if (questKind === NOTICE_THREE_KIND) {
      const result = pickNoticeThree({ seen: seenRef.current });
      if (!result.prompt) return;
      rememberSeen(result.seen);
      showQuest(result.prompt, NOTICE_THREE_KIND);
      setStep('three');
      return;
    }
    const result = pickQuest({ kind, maxMinutes, seen: seenRef.current });
    if (!result.prompt) return;
    rememberSeen(result.seen);
    showQuest(result.prompt, result.prompt.kind);
    setStep('prompt');
  }

  function handleDone() {
    stopCountdown();
    setTimeUp(false);
    setMessage('');
    setStep('done');
  }

  function handleChange() {
    stopCountdown();
    setMessage('');
    setStep('pick');
  }

  function toggleCheck(i) {
    setChecks((prev) => prev.map((c, j) => (j === i ? !c : c)));
  }

  function confirmAndLeave(text) {
    setConfirmText(text);
    AccessibilityInfo.announceForAccessibility(text);
    confirmTimer.current = setTimeout(() => router.back(), CONFIRM_MS);
  }

  function showError(text) {
    setMessage(text);
    AccessibilityInfo.announceForAccessibility(text);
  }

  // Saves this quest once; returns its id, or null on failure.
  async function ensureQuestSaved() {
    if (questId) return questId;
    const { data, error } = await saveQuickQuest(userId, {
      kind: questKind,
      minutes: prompt?.minutes ?? null,
      promptKey: questKind === NOTICE_THREE_KIND ? null : prompt?.key ?? null,
    });
    if (error || !data?.id) {
      console.warn('quick-quest: save failed', error?.code || error?.message || error);
      return null;
    }
    setQuestId(data.id);
    return data.id;
  }

  async function handleSave() {
    if (busy || !userId) return;
    setBusy(true);
    setMessage('');
    const id = await ensureQuestSaved();
    if (!id) {
      setBusy(false);
      showError("Couldn't save. Please try again.");
      return;
    }
    confirmAndLeave(tokensOn ? 'Saved. +1 token.' : 'Saved.');
  }

  async function handleKeep() {
    const text = note.trim();
    if (busy || !userId || !text) return;
    setBusy(true);
    setMessage('');

    const id = await ensureQuestSaved();
    if (!id) {
      setBusy(false);
      showError("Couldn't save. Please try again.");
      return;
    }

    // A private Tickle with the same fields Quick Tickle uses
    // (lib/quickTickle.js insertQuickTickle), plus the note and the Vibe
    // (or none).
    const { data, error } = await supabase
      .from('tickle_entries')
      .insert({
        user_id: userId,
        entry_date: localDateString(),
        text_content: text,
        tickle_nature: vibe,
        visibility: 'private',
      })
      .select('id')
      .single();
    if (error || !data?.id) {
      console.warn('quick-quest: keep failed', error?.code || error?.message || error);
      setBusy(false);
      showError("Couldn't keep it as a Tickle. Your quest is saved. Please try again.");
      return;
    }

    // Best-effort: the Tickle and the token are saved either way.
    await linkQuestToEntry(id, data.id);

    confirmAndLeave(tokensOn ? 'Kept as a Tickle. +1 token.' : 'Kept as a Tickle.');
  }

  const kindChip = KIND_CHIPS.find((k) => k.key === kind) || KIND_CHIPS[0];
  const lengthText = maxMinutes === QUEST_TIME_ANY ? 'any length' : `up to ${minutesLabel(maxMinutes)}`;
  const kindText = kind === 'any' ? 'any kind' : kindChip.label.toLowerCase();
  const willGet = `You will get one small thing to try: ${kindText}, ${lengthText}.`;
  const noteText = everyTime
    ? `Saved on this phone. Next time the dice goes straight to a quest like this. Change it in Settings, Look and feel. ${willGet}`
    : willGet;

  const counting = !!endAt;
  const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, 1 - remainingSeconds / totalSeconds)) : 0;

  function renderClock() {
    return (
      <View style={styles.clockBlock}>
        <View accessible accessibilityRole="timer" accessibilityLabel={spokenRemaining(remainingSeconds)}>
          <Text style={styles.clock}>{clockText(remainingSeconds)}</Text>
        </View>
        <View style={styles.progressTrack} importantForAccessibility="no-hide-descendants" accessible={false}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
    );
  }

  function renderMessage() {
    if (!message) return null;
    return <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>;
  }

  function renderConfirm() {
    if (!confirmText) return null;
    return (
      <View style={styles.confirm}>
        <Ionicons name="checkmark-circle" size={20} color={CREAM} />
        <Text style={styles.confirmText}>{confirmText}</Text>
      </View>
    );
  }

  function renderPick() {
    return (
      <>
        <Text style={styles.title} accessibilityRole="header">Quick Quest</Text>
        <Text style={styles.lead}>A small thing to try. No score. Save it for a token, or keep it as a Tickle.</Text>

        <Text style={styles.groupLabel} accessibilityRole="header">How long have you got?</Text>
        <View style={styles.chipRow}>
          {TIME_CHIPS.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              selected={maxMinutes === c.value}
              onPress={() => { setMaxMinutes(c.value); setMessage(''); }}
            />
          ))}
        </View>

        <Text style={styles.groupLabel} accessibilityRole="header">What kind?</Text>
        <View style={styles.chipRow}>
          {KIND_CHIPS.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected={kind === c.key}
              onPress={() => { setKind(c.key); setMessage(''); }}
            />
          ))}
        </View>
        <Text style={styles.hint}>{kindChip.hint}</Text>

        <TouchableOpacity
          style={styles.switchRow}
          onPress={() => setEveryTime((v) => !v)}
          activeOpacity={0.8}
          accessibilityRole="switch"
          accessibilityLabel="Use this every time"
          accessibilityHint="The dice button goes straight to a quest."
          accessibilityState={{ checked: everyTime }}
        >
          <View style={styles.switchText}>
            <Text style={styles.switchLabel}>Use this every time</Text>
            <Text style={styles.switchSub}>The dice button goes straight to a quest.</Text>
          </View>
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <Switch
              value={everyTime}
              onValueChange={setEveryTime}
              trackColor={{ false: C.border, true: DUSK }}
              thumbColor={CARD}
            />
          </View>
        </TouchableOpacity>

        <View style={styles.noteBox}>
          <Text style={styles.noteBoxText}>{noteText}</Text>
        </View>

        {renderMessage()}

        <View style={styles.buttons}>
          <PrimaryButton title="Give me a quest" onPress={handleGiveQuest} />
          <OutlineButton title="Notice three things (2 min)" onPress={handleNoticeThree} />
        </View>
      </>
    );
  }

  function renderPrompt() {
    const minutes = prompt?.minutes ?? 1;
    return (
      <>
        <Tag text={`${questKindLabel(questKind)} · about ${minutes} min`} />
        <Text style={styles.promptText}>{prompt?.text}</Text>
        <Text style={styles.lead}>Take your time. You can start the countdown, or just do it and come back.</Text>
        <View style={styles.buttons}>
          <PrimaryButton title={`Start ${minutes} minute countdown`} onPress={() => { startCountdown(minutes); setStep('count'); }} />
          <OutlineButton title="Another one" onPress={handleAnother} />
          <QuietButton title="I've done it" onPress={handleDone} />
          <QuietButton title="Not now" onPress={leave} />
          <QuietButton title="Change time or kind" onPress={handleChange} link />
        </View>
      </>
    );
  }

  function renderCount() {
    return (
      <>
        {renderClock()}
        <Text style={styles.promptText}>{prompt?.text}</Text>
        <View style={styles.buttons}>
          <PrimaryButton title="I'm done" onPress={handleDone} />
          <OutlineButton title="Another one" onPress={handleAnother} />
        </View>
        <Text style={styles.quietLine}>Nothing rings. When the time is up you will see a quiet message here.</Text>
      </>
    );
  }

  function renderThree() {
    return (
      <>
        <Tag text={`Notice three things · ${NOTICE_THREE_MINUTES} min`} />
        <Text style={styles.promptText} accessibilityRole="header">{prompt?.text}</Text>
        {counting && renderClock()}
        <View style={styles.threeRows}>
          {THREE_ROWS.map((label, i) => (
            <TouchableOpacity
              key={label}
              style={styles.threeRow}
              onPress={() => toggleCheck(i)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityLabel={label}
              accessibilityState={{ checked: checks[i] }}
            >
              <View style={[styles.checkCircle, checks[i] && styles.checkCircleOn]}>
                {checks[i] && <Ionicons name="checkmark" size={18} color={CREAM} />}
              </View>
              <Text style={styles.threeRowText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.buttons}>
          {!counting && (
            <PrimaryButton
              title={`Start ${NOTICE_THREE_MINUTES} minute countdown`}
              onPress={() => startCountdown(NOTICE_THREE_MINUTES)}
            />
          )}
          <OutlineButton title="Another one" onPress={handleAnother} />
          <QuietButton title="Not now" onPress={leave} />
        </View>
        {counting && (
          <Text style={styles.quietLine}>Nothing rings. When the time is up you will see a quiet message here.</Text>
        )}
        {/* At the bottom: the main button while the countdown runs,
            outlined beside "Start ... countdown" before it does. */}
        <View style={styles.buttons}>
          {counting
            ? <PrimaryButton title="I'm done" onPress={handleDone} />
            : <OutlineButton title="I'm done" onPress={handleDone} />}
        </View>
      </>
    );
  }

  function renderDone() {
    return (
      <>
        <Text style={styles.title} accessibilityRole="header">{timeUp ? 'Time is up' : 'Nicely done'}</Text>
        <View style={styles.card}>
          <Text style={styles.cardKind}>{questKindLabel(questKind).toUpperCase()}</Text>
          <Text style={styles.cardText}>{prompt?.text}</Text>
        </View>
        <Text style={styles.lead}>Nicely done. Save it, or write a line and keep it as a Tickle.</Text>
        {renderMessage()}
        {renderConfirm()}
        <View style={styles.buttons}>
          <PrimaryButton title="Save it" onPress={handleSave} disabled={busy} tokenPill={tokensOn} />
          <OutlineButton title="Keep as a Tickle" onPress={() => { setMessage(''); setStep('keep'); }} disabled={busy} />
          <QuietButton title="Not now" onPress={leave} disabled={busy} />
        </View>
        {tokensOn && <Text style={styles.smallNote}>Saving takes one tap. You get the token either way.</Text>}
        {busy && !confirmText && <ActivityIndicator color={DUSK} style={styles.spinner} />}
      </>
    );
  }

  function renderKeep() {
    const suggested = defaultVibeFor(questKind);
    let vibeLine;
    if (!vibe) vibeLine = 'No Vibe. That is fine, the Tickle is kept without one.';
    else if (vibe === suggested) vibeLine = `Suggested for ${withArticle(questKind)}. Tap it again to clear, or pick another.`;
    else vibeLine = 'Tap it again to clear.';
    const canKeep = note.trim().length > 0;
    return (
      <>
        <Text style={styles.title} accessibilityRole="header">Keep as a Tickle</Text>
        <View style={styles.card}>
          <Text style={styles.cardKind}>{questKindLabel(questKind).toUpperCase()}</Text>
          <Text style={styles.cardText}>{prompt?.text}</Text>
        </View>

        <Text style={styles.groupLabel} importantForAccessibility="no">What did you notice?</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={(t) => setNote(t.slice(0, NOTE_MAX_LEN))}
          maxLength={NOTE_MAX_LEN}
          multiline
          textAlignVertical="top"
          placeholder="A line is plenty."
          placeholderTextColor={MUTED}
          accessibilityLabel="What did you notice?"
          editable={!busy}
        />
        <Text style={styles.counter}>{note.length}/{NOTE_MAX_LEN}</Text>

        <Text style={styles.groupLabel} accessibilityRole="header">Vibe (optional)</Text>
        <View style={styles.vibeRow}>
          {NATURE_ORDER.map((key) => {
            const selected = vibe === key;
            const color = VIBE_FILL[key];
            return (
              <TouchableOpacity
                key={key}
                style={[styles.vibeButton, { borderColor: color }, selected && { backgroundColor: color }]}
                onPress={() => setVibe(selected ? null : key)}
                activeOpacity={0.8}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={NATURE_LABELS[key]}
                accessibilityState={{ selected, disabled: busy }}
              >
                <Text style={[styles.vibeButtonText, { color: selected ? CREAM : color }]}>{NATURE_LABELS[key]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>{vibeLine}</Text>

        {renderMessage()}
        {renderConfirm()}
        <View style={styles.buttons}>
          <PrimaryButton title="Keep as a Tickle" onPress={handleKeep} disabled={busy || !canKeep} tokenPill={tokensOn} />
          <QuietButton title="Back" onPress={() => { setMessage(''); setStep('done'); }} disabled={busy} />
        </View>
        {busy && !confirmText && <ActivityIndicator color={DUSK} style={styles.spinner} />}
      </>
    );
  }

  let body = null;
  if (!ready) body = <ActivityIndicator color={DUSK} style={styles.spinner} />;
  else if (step === 'pick') body = renderPick();
  else if (step === 'prompt') body = renderPrompt();
  else if (step === 'count') body = renderCount();
  else if (step === 'three') body = renderThree();
  else if (step === 'done') body = renderDone();
  else if (step === 'keep') body = renderKeep();

  return (
    <WallpaperBackground>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.closeButton}
            onPress={leave}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Close Quick Quest"
          >
            <Ionicons name="close" size={26} color={C.rustDark} />
          </TouchableOpacity>
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  closeButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    marginLeft: -10, marginBottom: 4,
  },
  spinner: { marginTop: 16 },

  title: { fontSize: 24, fontWeight: '700', color: C.rustDark, marginBottom: 8 },
  lead: { fontSize: 15, lineHeight: 21, color: C.subtext, marginTop: 4, marginBottom: 12 },
  groupLabel: { fontSize: 15, fontWeight: '700', color: C.rustDark, marginTop: 16, marginBottom: 8 },
  hint: { fontSize: 13, lineHeight: 18, color: C.subtext, marginTop: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: CARD, alignItems: 'center', justifyContent: 'center',
  },
  chipSelected: { backgroundColor: DUSK, borderColor: DUSK },
  chipText: { fontSize: 15, fontWeight: '600', color: C.rustDark },
  chipTextSelected: { color: CREAM },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginTop: 20,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    backgroundColor: CARD,
  },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: C.rustDark },
  switchSub: { fontSize: 13, color: C.subtext, marginTop: 2 },

  noteBox: {
    marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(66,87,98,0.08)',
  },
  noteBoxText: { fontSize: 13, lineHeight: 19, color: MUTED },

  message: { fontSize: 14, color: C.error, marginTop: 12 },
  confirm: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: DUSK,
  },
  confirmText: { fontSize: 15, fontWeight: '600', color: CREAM, flexShrink: 1 },

  buttons: { marginTop: 20, gap: 10 },
  primaryButton: {
    minHeight: 56, borderRadius: 28, backgroundColor: DUSK, paddingHorizontal: 20, paddingVertical: 8,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: CREAM, textAlign: 'center' },
  tokenPill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(255,248,236,0.22)',
  },
  tokenPillText: { fontSize: 12, fontWeight: '700', color: CREAM },
  outlineButton: {
    minHeight: 52, borderRadius: 26, borderWidth: 1.5, borderColor: DUSK, backgroundColor: CARD,
    paddingHorizontal: 20, paddingVertical: 8, alignItems: 'center', justifyContent: 'center',
  },
  outlineButtonText: { fontSize: 16, fontWeight: '600', color: DUSK, textAlign: 'center' },
  buttonDisabled: { opacity: 0.45 },
  quietButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  quietButtonText: { fontSize: 15, fontWeight: '600', color: DUSK, textAlign: 'center' },
  linkText: { textDecorationLine: 'underline' },
  quietDisabled: { opacity: 0.45 },
  quietLine: { fontSize: 13, lineHeight: 18, color: MUTED, marginTop: 16, textAlign: 'center' },
  smallNote: { fontSize: 13, color: MUTED, marginTop: 8, textAlign: 'center' },

  tag: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
    backgroundColor: DUSK, marginTop: 4,
  },
  tagText: { fontSize: 13, fontWeight: '700', color: CREAM },
  promptText: { fontSize: 24, lineHeight: 31, fontWeight: '700', color: C.rustDark, marginTop: 16 },

  clockBlock: { marginTop: 16 },
  clock: {
    fontSize: 56, fontWeight: '700', color: C.rustDark, fontVariant: ['tabular-nums'], textAlign: 'center',
  },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: C.border, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: 4, backgroundColor: DUSK },

  threeRows: { marginTop: 16, gap: 8 },
  threeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: CARD,
  },
  checkCircle: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: DUSK,
    alignItems: 'center', justifyContent: 'center',
  },
  checkCircleOn: { backgroundColor: DUSK },
  threeRowText: { fontSize: 16, color: C.rustDark, flexShrink: 1 },

  card: {
    marginTop: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: CARD,
  },
  cardKind: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: MUTED },
  cardText: { fontSize: 17, lineHeight: 23, color: C.rustDark, marginTop: 6 },

  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12, minHeight: 110, fontSize: 16,
    backgroundColor: CARD, color: C.text,
  },
  counter: { alignSelf: 'flex-end', color: C.subtext, fontSize: 12, marginTop: 4 },

  vibeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vibeButton: {
    minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, backgroundColor: CARD,
    alignItems: 'center', justifyContent: 'center', flexGrow: 1,
  },
  vibeButtonText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
