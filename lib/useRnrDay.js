// lib/useRnrDay.js
//
// One day's Routines and Reminders, shared by the today pop-up
// (components/RnrsPopup.js) and the full page (app/(tabs)/rnrs.js).
// Every change is optimistic: the list updates at once, and if the
// server refuses, it goes back the way it was and showSaveFailed() says
// so -- the same pattern as Home's Quick Tickle Undo.
//
// Also holds the session-only set of tiles showing "Log it": a tile gets
// it when marked Done here, and loses it on Undo or once a Vibe has been
// logged from it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { showSaveFailed } from './themedAlert';
import {
  fetchDayPlacements, addPlacement, setPlacementStatus, movePlacement,
} from './rnrs';

export function useRnrDay(userId, planDate, enabled = true) {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [logItIds, setLogItIds] = useState(() => new Set());
  // Latest list, so a rollback restores what was there before this change
  // even when two taps land close together.
  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  // Ignores a slow answer for a day the user has already switched away from.
  const requestRef = useRef(0);

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

  function addLogIt(id) {
    setLogItIds((prev) => new Set(prev).add(id));
  }

  function dropLogIt(id) {
    setLogItIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // status: 'done', 'skipped' or 'planned' (undo of either).
  async function setStatus(placement, status) {
    const previous = placementsRef.current;
    setPlacements((prev) => prev.map((p) => (p.id === placement.id ? { ...p, status } : p)));
    if (status === 'done') addLogIt(placement.id);
    else dropLogIt(placement.id);
    const { error } = await setPlacementStatus(placement.id, status);
    if (error) {
      console.warn('useRnrDay: status failed', error);
      setPlacements(previous);
      dropLogIt(placement.id);
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
    if (leavesDay) dropLogIt(placement.id);
    const { error } = await movePlacement(placement.id, { slot, planDate: toDate });
    if (error) {
      console.warn('useRnrDay: move failed', error);
      setPlacements(previous);
      showSaveFailed();
    }
  }

  // Adds a starter (starterKey) or own tile (tileId) to a slot of this
  // day. Not optimistic: the new row's id comes from the server.
  async function add(slot, { starterKey, tileId }) {
    const { data, error } = await addPlacement(userId, { planDate, slot, starterKey, tileId });
    if (error || !data) {
      console.warn('useRnrDay: add failed', error);
      showSaveFailed();
      return false;
    }
    setPlacements((prev) => [...prev, data]);
    return true;
  }

  return {
    placements, setPlacements, loading, loadError, reload,
    setStatus, move, add, logItIds, dropLogIt,
  };
}
