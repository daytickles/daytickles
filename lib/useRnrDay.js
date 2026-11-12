// lib/useRnrDay.js
//
// One day's Routines and Reminders, shared by the today pop-up
// (components/RnrsPopup.js) and the full page (app/(tabs)/rnrs.js).
// Every change is optimistic: the list updates at once, and if the
// server refuses, it goes back the way it was and showSaveFailed() says
// so -- the same pattern as Home's Quick Tickle Undo.
//
// Quick Notes (QN, migration 0084): Done on a tile planned for TODAY goes
// through requestDone. With no QN logged for that placement yet it opens
// the Vibe pop-up (vibeFor); picking a Vibe marks the tile done, then logs
// a private, text-less Quick Tickle carrying a COPY of the tile's words
// (quick_note) and the placement id. "Just mark done" only marks it done.
// Closing the pop-up changes nothing. The toast's Undo deletes that QN and
// puts the tile back to planned. Done on any other day, or on a tile that
// already has a QN, just marks it done, as before. The database gives +1
// token, once per placement, when the placement has earns_tokens on.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { supabase } from './supabase';
import { showSaveFailed } from './themedAlert';
import { localDateString } from './week';
import { NATURE_LABELS } from './theme';
import { insertQuickTickle, forgetQuickTickle } from './quickTickle';
import {
  fetchDayPlacements, addPlacement, setPlacementStatus, movePlacement,
  setPlacementEarns, findLoggedNoteId, placementLabel, sortDoneLast,
} from './rnrs';

// tickle_entries.quick_note's limit (migration 0084).
const QUICK_NOTE_MAX = 80;

// True when this placement has already earned its one nudge token (so the
// pop-up doesn't promise "+1 token" again after an Undo). false on error.
async function placementHasEarned(placementId) {
  try {
    const { data, error } = await supabase
      .from('token_events')
      .select('id')
      .eq('rnr_placement_id', placementId)
      .eq('reason', 'nudge_log')
      .limit(1);
    return !error && (data || []).length > 0;
  } catch {
    return false;
  }
}

// True when the database awarded a token for this QN (the trigger writes
// entry_id only when it really added one). false on error.
async function entryEarnedToken(entryId) {
  try {
    const { data, error } = await supabase
      .from('token_events')
      .select('id')
      .eq('entry_id', entryId)
      .eq('reason', 'nudge_log')
      .limit(1);
    return !error && (data || []).length > 0;
  } catch {
    return false;
  }
}

export function useRnrDay(userId, planDate, enabled = true) {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Latest list, so a rollback restores what was there before this change
  // even when two taps land close together.
  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  // Ignores a slow answer for a day the user has already switched away from.
  const requestRef = useRef(0);
  // Quick Note: the open Vibe pop-up ({ placement, anchor, alreadyEarned }
  // or null), a save in flight, and the toast ({ id, label, placementId,
  // earned } or null).
  const [vibeFor, setVibeFor] = useState(null);
  const vibeForRef = useRef(null);
  vibeForRef.current = vibeFor;
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteToast, setNoteToast] = useState(null);
  // Placement ids whose Done is being handled (lookup, open pop-up, save):
  // a second tap on the same tile is ignored until it ends.
  const busyRef = useRef(new Set());

  const reload = useCallback(async () => {
    if (!userId || !planDate) return;
    const request = ++requestRef.current;
    setLoading(true);
    const { data, error } = await fetchDayPlacements(userId, planDate);
    if (request !== requestRef.current) return;
    setLoading(false);
    if (error) {
      console.warn('useRnrDay: load failed', error);
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setPlacements(data);
  }, [userId, planDate]);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  function patchLocal(placementId, patch) {
    setPlacements((prev) => prev.map((p) => (p.id === placementId ? { ...p, ...patch } : p)));
  }

  // The list's current copy of a placement (earns_tokens may have changed
  // since the tile rendered), or the one passed in.
  function latest(placement) {
    return placementsRef.current.find((p) => p.id === placement.id) || placement;
  }

  // status: 'done', 'skipped' or 'planned' (undo of either).
  async function setStatus(placement, status) {
    const previous = placementsRef.current;
    setPlacements((prev) => prev.map((p) => (p.id === placement.id ? { ...p, status } : p)));
    const { error } = await setPlacementStatus(placement.id, status);
    if (error) {
      console.warn('useRnrDay: status failed', error);
      setPlacements(previous);
      showSaveFailed();
    }
  }

  // Done on a planned tile (button or TalkBack). The Vibe pop-up always
  // opens centred (anchor null).
  async function requestDone(placement) {
    const p = latest(placement);
    if (busyRef.current.has(p.id)) return;
    if (p.plan_date !== localDateString()) {
      await setStatus(p, 'done');
      return;
    }
    busyRef.current.add(p.id);
    const loggedId = await findLoggedNoteId(p.id);
    if (loggedId) {
      busyRef.current.delete(p.id);
      await setStatus(p, 'done');
      return;
    }
    const alreadyEarned = p.earns_tokens ? await placementHasEarned(p.id) : false;
    setNoteToast(null);
    setVibeFor({ placement: p, anchor: null, alreadyEarned });
  }

  // A Vibe picked in the pop-up: done first, then the QN. A failed insert
  // puts the tile back to planned.
  async function pickVibe(nature) {
    const v = vibeForRef.current;
    if (!v || noteSaving) return;
    const p = latest(v.placement);
    setNoteSaving(true);
    setVibeFor(null);
    const previousStatus = p.status;
    patchLocal(p.id, { status: 'done' });
    const { error: statusError } = await setPlacementStatus(p.id, 'done');
    if (statusError) {
      console.warn('useRnrDay: QN status failed', statusError);
      patchLocal(p.id, { status: previousStatus });
      busyRef.current.delete(p.id);
      setNoteSaving(false);
      showSaveFailed();
      return;
    }
    const quickNote = (p.label || placementLabel(p)).trim().slice(0, QUICK_NOTE_MAX);
    const { data, error } = await insertQuickTickle(userId, nature, 'id, tickle_nature', {
      quickNote,
      rnrPlacementId: p.id,
    });
    if (error || !data) {
      console.warn('useRnrDay: QN insert failed', error);
      patchLocal(p.id, { status: 'planned' });
      await setPlacementStatus(p.id, 'planned');
      busyRef.current.delete(p.id);
      setNoteSaving(false);
      showSaveFailed();
      return;
    }
    const earned = p.earns_tokens && !v.alreadyEarned ? await entryEarnedToken(data.id) : false;
    busyRef.current.delete(p.id);
    setNoteSaving(false);
    setNoteToast({ id: data.id, label: NATURE_LABELS[nature], placementId: p.id, earned });
  }

  // "Just mark done": done, no Tickle.
  async function justMarkDone() {
    const v = vibeForRef.current;
    if (!v || noteSaving) return;
    const p = latest(v.placement);
    setVibeFor(null);
    busyRef.current.delete(p.id);
    await setStatus(p, 'done');
  }

  // Backdrop / Back: nothing changes.
  function closeVibe() {
    const v = vibeForRef.current;
    if (v) busyRef.current.delete(v.placement.id);
    setVibeFor(null);
  }

  // The toast's Undo: deletes the QN, then puts the tile back to planned.
  // A token already given stays (tokens are never taken back).
  async function undoNote() {
    const t = noteToast;
    if (!t) return;
    setNoteToast(null);
    const { error } = await supabase.from('tickle_entries').delete().eq('id', t.id);
    if (error) {
      console.warn('useRnrDay: QN undo failed', error);
      showSaveFailed();
      return;
    }
    forgetQuickTickle(t.id);
    AccessibilityInfo.announceForAccessibility('Removed');
    const before = placementsRef.current.find((p) => p.id === t.placementId);
    patchLocal(t.placementId, { status: 'planned' });
    const { error: statusError } = await setPlacementStatus(t.placementId, 'planned');
    if (statusError) {
      console.warn('useRnrDay: QN undo status failed', statusError);
      if (before) patchLocal(t.placementId, { status: before.status });
      showSaveFailed();
    }
  }

  const clearNoteToast = useCallback(() => setNoteToast(null), []);

  // Leaving the screen / closing the pop-up: no Vibe pop-up, no toast.
  const dismissNote = useCallback(() => {
    const v = vibeForRef.current;
    if (v) busyRef.current.delete(v.placement.id);
    setVibeFor(null);
    setNoteToast(null);
  }, []);

  // "Earn tokens" on one placed nudge, on or off.
  async function toggleEarns(placement) {
    const p = latest(placement);
    const next = !p.earns_tokens;
    patchLocal(p.id, { earns_tokens: next });
    const { error } = await setPlacementEarns(p.id, next);
    if (error) {
      console.warn('useRnrDay: earns_tokens failed', error);
      patchLocal(p.id, { earns_tokens: !next });
      showSaveFailed();
    }
  }

  // Another slot on this day, and/or another day (planDate). Moved to
  // another day, it leaves this list.
  async function move(placement, { slot, planDate: toDate }) {
    const previous = placementsRef.current;
    const leavesDay = toDate && toDate !== planDate;
    setPlacements((prev) => (leavesDay
      ? prev.filter((p) => p.id !== placement.id)
      : prev.map((p) => (p.id === placement.id ? { ...p, slot: slot || p.slot } : p))));
    const { error } = await movePlacement(placement.id, { slot, planDate: toDate });
    if (error) {
      console.warn('useRnrDay: move failed', error);
      setPlacements(previous);
      showSaveFailed();
    }
  }

  // Adds a starter (starterKey) or own tile (tileId) to a slot of this
  // day. Not optimistic: the new row's id comes from the server.
  async function add(slot, { starterKey, tileId, earnsTokens = false }) {
    const { data, error } = await addPlacement(userId, { planDate, slot, starterKey, tileId, earnsTokens });
    if (error || !data) {
      console.warn('useRnrDay: add failed', error);
      showSaveFailed();
      return false;
    }
    setPlacements((prev) => [...prev, data]);
    return true;
  }

  // Every screen lists these by slot (the full page, the Home pop-up and
  // Home's Nudges & Notes card), so Done tiles go last here, once. The
  // state itself keeps the loaded order, so a tile set back to planned
  // returns to its original place, and a tile marked Done moves down at
  // once (its status changes locally first).
  const displayPlacements = sortDoneLast(placements);

  return {
    placements: displayPlacements, setPlacements, loading, loadError, reload,
    setStatus, move, add, toggleEarns,
    requestDone, vibeFor, noteSaving, pickVibe, justMarkDone, closeVibe,
    noteToast, undoNote, clearNoteToast, dismissNote,
  };
}
