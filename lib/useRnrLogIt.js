// lib/useRnrLogIt.js
//
// "Log it" on a Done Routines and Reminders tile: opens Quick Tickle's
// Vibe sheet (components/QuickTicklePopover.js) anchored to the pill.
// Nothing is written until the user picks a Vibe; then it is the same
// private, text-less Quick Tickle as Home's dot logs, with the same
// toast (Undo deletes that row, Tickle it opens it in New Tickle). The
// caller renders the popover and the toast from what this returns.

import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { NATURE_LABELS } from './theme';
import { insertQuickTickle, forgetQuickTickle } from './quickTickle';
import { showSaveFailed } from './themedAlert';

// onLogged(placement) runs after a Vibe is saved (the caller drops the
// tile's "Log it"); beforeLeave() runs before Tickle it navigates away
// (the pop-up closes itself).
export function useRnrLogIt(userId, { onLogged, beforeLeave } = {}) {
  const [target, setTarget] = useState(null); // { placement, anchor }
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { id, label }

  function open(placement, anchor) {
    setToast(null);
    setTarget({ placement, anchor });
  }

  function close() {
    setTarget(null);
  }

  async function pick(nature) {
    if (saving || !userId || !target) return;
    const { placement } = target;
    setSaving(true);
    setTarget(null);
    setToast(null);
    const { data, error } = await insertQuickTickle(userId, nature);
    setSaving(false);
    if (error || !data) {
      console.warn('useRnrLogIt: insert failed', error);
      showSaveFailed();
      return;
    }
    onLogged?.(placement);
    setToast({ id: data.id, label: NATURE_LABELS[nature] });
  }

  // Deletes just the row this toast logged, by id.
  async function undo() {
    const current = toast;
    if (!current) return;
    setToast(null);
    const { error } = await supabase.from('tickle_entries').delete().eq('id', current.id);
    if (error) {
      showSaveFailed();
    } else {
      AccessibilityInfo.announceForAccessibility('Removed');
      forgetQuickTickle(current.id);
    }
  }

  // The existing Edit route, same as Home's toast.
  function tickleIt() {
    const current = toast;
    if (!current) return;
    setToast(null);
    beforeLeave?.();
    router.push({ pathname: '/create', params: { entryId: current.id } });
  }

  function dismissToast() {
    setToast(null);
  }

  return {
    popoverProps: {
      visible: !!target,
      anchor: target?.anchor || null,
      onPick: pick,
      onClose: close,
      saving,
    },
    toastProps: {
      toast,
      onUndo: undo,
      onTickleIt: tickleIt,
      onTimeout: dismissToast,
    },
    open,
    dismissToast,
  };
}
