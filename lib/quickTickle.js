// lib/quickTickle.js
//
// Quick Tickle helpers. A Quick Tickle is a private, text-less Tickle
// logged in one tap from Home's dot button: entry_kind 'text' with
// text_content null (never '' -- the char_length 1..500 check from 0001
// still rejects an empty string; see migration 0055).
//
// Dismissals of the "Tickle it" pill on its card live in AsyncStorage,
// per phone, as one JSON list of entry ids -- no DB change. Entry ids are
// uuids, so one list serves every account on the device. Every read and
// write is best-effort: a storage failure just means the pill shows.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { localDateString } from './week';

const DISMISSED_KEY = 'daytickles-quick-tickle-dismissed';

// Logs one Quick Tickle for today: private, no text, no goal, Multickle
// or photo, so it earns no token, sends no Tic notification and uses no
// Ripple cap. select is the columns the new row comes back with (Home
// passes the ones its entries list uses). Returns { data, error }.
export async function insertQuickTickle(userId, nature, select = 'id, tickle_nature') {
  return supabase
    .from('tickle_entries')
    .insert({
      user_id: userId,
      entry_date: localDateString(),
      text_content: null,
      tickle_nature: nature,
      visibility: 'private',
    })
    .select(select)
    .single();
}

// True for a text-less, photo-less written Tickle -- what the Quick
// Tickle card treatment, and the hidden Ripple/Share, key on.
export function isQuickTickle(entry, hasPhoto) {
  return entry.entry_kind === 'text' && !entry.text_content && !hasPhoto;
}

// Loaded once per app run and shared by every card, so a long Tickle
// Stash doesn't read storage once per card.
let dismissedPromise = null;

function loadDismissed() {
  if (!dismissedPromise) {
    dismissedPromise = AsyncStorage.getItem(DISMISSED_KEY)
      .then((raw) => {
        const list = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(list) ? list : []);
      })
      .catch(() => new Set());
  }
  return dismissedPromise;
}

async function saveDismissed(set) {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    // Best-effort only.
  }
}

export async function dismissTickleIt(entryId) {
  const set = await loadDismissed();
  set.add(entryId);
  await saveDismissed(set);
}

// Called after a Tickle is deleted, so its id doesn't linger in the list.
// No write when the id was never dismissed.
export async function forgetQuickTickle(entryId) {
  const set = await loadDismissed();
  if (!set.delete(entryId)) return;
  await saveDismissed(set);
}

// null until storage has answered, so the pill doesn't flash on a card
// whose pill was already dismissed.
export function useTickleItDismissed(entryId, enabled) {
  const [dismissed, setDismissed] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadDismissed().then((set) => {
      if (!cancelled) setDismissed(set.has(entryId));
    });
    return () => {
      cancelled = true;
    };
  }, [entryId, enabled]);

  async function dismiss() {
    setDismissed(true);
    await dismissTickleIt(entryId);
  }

  return [dismissed, dismiss];
}
