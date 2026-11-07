import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor, darken, textOn, withAlpha, ALL_NATURES, NATURE_LABELS, vibeIconColor } from '../../lib/theme';
import { shareEntry, useShareStatus, sharePhotoOnlyEntry, SHARE_CAPTIONS } from '../../lib/sharing';
import { alertCapBlocked, checkAndConsumeWeeklyCap, rippleFeatureFor } from '../../lib/freemiumCaps';
import { showAlert, showSaveFailed } from '../../lib/themedAlert';
import { assignEntryGoal } from '../../lib/goalTagging';
import GoalTagModal from '../../components/GoalTagModal';
import { assignEntryTale, fetchMyTales, fetchTaleBadges } from '../../lib/tales';
import { fetchDonePlacementsInRange, RNR_SLOT_LABELS } from '../../lib/rnrs';
import { BUTTON_HEIGHT, BUTTON_HIT_SLOP } from '../../lib/buttonSize';
import TaleTagModal from '../../components/TaleTagModal';
import NatureIcon from '../../components/NatureIcon';
import ShareModal from '../../components/ShareModal';
import PhotoEnlargeModal from '../../components/PhotoEnlargeModal';
import EntryCard from '../../components/EntryCard';
import CornerNav from '../../components/CornerNav';
import WallpaperBackground from '../../components/WallpaperBackground';
import {
  initPinBoardDb, getAllLinkedEntryIds, getPhotoForEntry, getPhotosForEntries, relinkPhotoToEntry,
} from '../../lib/pinBoardDb';
import { pickFromLibrary, pickImageFileByName } from '../../lib/pinBoardPhotos';
import { DEFAULT_WEEK_START_DAY } from '../../lib/week';
import { useShareCard } from '../../lib/useShareCard';
import { forgetQuickTickle } from '../../lib/quickTickle';
import { makePhotoTicklePublic, makePhotoTicklePrivate, deletePhotoTickleMedia } from '../../lib/photoTickleStorage';

// Indexed like Date.getDay() (0 = Sunday). The header is rotated to the
// person's "Week starts on" setting (profiles.week_start_day, same 0-6
// numbering -- see migration 0019), like Home, Goals and Weekly Summary.
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Same relative progression as DayDotsCard.js's own DOT_SIZES (22/30/38/46
// there) and weekly-summary.js's own DAY_DOTS_SIZES, scaled for this grid's
// per-day cell -- not meant to be pixel-precise, just enough spread that a
// small pick reads visibly smaller than a large one at a glance.
const DAY_DOTS_SIZES = [9, 12, 15, 18];
// Words for each DAY_DOTS_SIZES pick, for the grid cells' TalkBack label.
const DAY_DOTS_SIZE_WORDS = ['small', 'medium', 'large', 'extra large'];
// Routines and Reminders tiles marked Done are recorded here
// automatically: a small neutral tick in the day cell's top-right corner
// (absolutely placed, so the cell, Day Dot and Tickle dot don't move) and
// a plain list in the day detail. No Vibe colour -- they aren't Tickles.
const RNR_TICK_SIZE = 10;
const RNR_TICK_INSET = 3;
const RNR_DETAIL_ICON_SIZE = 16;

const ENTRY_SELECT =
  'id, entry_date, text_content, like_count, tickle_nature, goal_id, tale_id, visibility, is_edited, created_at, user_id, entry_kind, local_photo_filename, media_url, profiles!tickle_entries_user_id_fkey(username, avatar_emoji, accent_theme, country, founding_member_number)';

// Same idea as feed.js's own resolveLinkedPhotoUris -- resolves both
// photo_only entries and entry_kind='text' entries with a Tickle-a-
// Photo link, for EntryCard.js's linkedPhotoStrip. The media_url
// fallback (now entry_kind-agnostic, matching feed.js -- the upload-
// on-make-public mechanic covers both kinds) mostly matters for the
// owner's own second device here, since Calendar's day entries are
// always this account's own (loadDayEntries always filters
// user_id=session.user.id) -- but keeping the same resolution logic in
// both places means neither screen has to know which case it is.
async function resolveLinkedPhotoUris(userId, entries) {
  if (!entries.length) return new Map();

  const localPhotos = await getPhotosForEntries(userId, entries.map((e) => e.id));
  const map = new Map();
  for (const entry of entries) {
    const local = localPhotos.get(entry.id);
    if (local && new File(local.file_path).exists) {
      map.set(entry.id, local.file_path);
    } else if (entry.media_url) {
      map.set(entry.id, entry.media_url);
    }
  }
  return map;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoDate(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export default function Calendar() {
  const { session, profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  // Selected-day-cell background is the person's actual accent color,
  // not the darkened shade above (accentDark stays as-is for the
  // unselected "today" label and the hollow "has Tickles" dot, neither
  // of which has this contrast issue) -- accentCardText
  // is the correct-contrast color for anything drawn on top of it.
  const accentCard = accentFor(profile?.accent_theme).card;
  const accentCardText = textOn(accentCard);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [countsByDate, setCountsByDate] = useState({});
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(null);
  const [dayEntries, setDayEntries] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);
  // Which of the selected day's summary pills is open: 'tickles',
  // 'goals' or null. Stays open when another day is tapped, so days can
  // be browsed with the same detail showing.
  const [openPill, setOpenPill] = useState(null);

  // 'YYYY-MM-DD' -> { status, dot_index } for whichever month is in view --
  // a day with no key here simply has no day_dots row yet (unanswered),
  // same shape as weekly-summary.js's own dayDotsPicks but keeping status
  // too (that screen only ever renders answered rows; this grid also needs
  // to distinguish skipped from unanswered).
  const [dayDotsByDate, setDayDotsByDate] = useState({});
  // 'YYYY-MM-DD' -> Done Routines and Reminders placements (each with a
  // label and slot) for the month in view. Empty after a failed read, so
  // the Calendar just shows no ticks.
  const [rnrDoneByDate, setRnrDoneByDate] = useState({});

  const [goals, setGoals] = useState([]);
  const [pickerEntryId, setPickerEntryId] = useState(null);
  // TickleTales -- same three pieces of state as feed.js's own.
  const [myTales, setMyTales] = useState([]);
  const [taleBadges, setTaleBadges] = useState(new Map());
  const [talePickerEntryId, setTalePickerEntryId] = useState(null);
  const [shareEntryId, setShareEntryId] = useState(null);
  const [favoritedIds, setFavoritedIds] = useState(new Set());
  // Map<entryId, awardType> -- same shape/reasoning as feed.js's own
  // awardedTypes (private-to-giver RLS, loaded once per session below).
  const [awardedTypes, setAwardedTypes] = useState(new Map());
  // Map<entryId, string[]> -- same PUBLIC award-types map as feed.js's
  // own awardedPublicTypes (see migration 0054's awarded_entries view),
  // but reacts to dayEntries here (the currently-shown day's entries)
  // rather than a screen-wide entries list.
  const [awardedPublicTypes, setAwardedPublicTypes] = useState(new Map());
  const [photoLinkedIds, setPhotoLinkedIds] = useState(new Set());
  // Map<entryId, uri> -- same shape/reasoning as feed.js's own
  // linkedPhotoUris, resolved for whichever day's entries are currently
  // loaded (see loadDayEntries below).
  const [linkedPhotoUris, setLinkedPhotoUris] = useState(new Map());
  const [enlargeUri, setEnlargeUri] = useState(null);
  const { hiddenCard, captureCard } = useShareCard();

  const loadGoals = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setGoals(data || []);
  }, [session]);

  const loadFavorited = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('favorites')
      .select('entry_id')
      .eq('user_id', session.user.id);
    if (!error) setFavoritedIds(new Set((data || []).map((f) => f.entry_id)));
  }, [session]);

  // The month grid only needs each day's count (for the hollow
  // "has Tickles" dot) -- the full ENTRY_SELECT payload is fetched
  // separately, per day, only once a day is tapped.
  // Same (user_id, entry_date) shape as idx_entries_user_date.
  const loadMonth = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const start = isoDate(viewYear, viewMonth, 1);
    const end = isoDate(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());

    const { data, error } = await supabase
      .from('tickle_entries')
      .select('id, entry_date')
      .eq('user_id', session.user.id)
      .gte('entry_date', start)
      .lte('entry_date', end);

    if (!error) {
      const counts = {};
      (data || []).forEach((e) => {
        counts[e.entry_date] = (counts[e.entry_date] || 0) + 1;
      });
      setCountsByDate(counts);
    }
    setLoading(false);
  }, [session, viewYear, viewMonth]);

  // Same init-before-query shape as pinboard.js's loadBoard, so Calendar's
  // local Pin Board queries work even if this screen is opened before the
  // Pin Board tables have ever been created.
  const loadPinBoardData = useCallback(async () => {
    if (!session) return;
    await initPinBoardDb(session.user.id);
    const linkedIds = await getAllLinkedEntryIds(session.user.id);
    setPhotoLinkedIds(new Set(linkedIds));
  }, [session]);

  // Own loader, same (start, end) range shape as loadMonth above but a
  // separate query against day_dots rather than tickle_entries -- Day
  // Dots is deliberately not a Tickle (see supabase/migrations/0060_day_dots.sql),
  // so it has no row in tickle_entries for loadMonth's query to have
  // already picked up.
  const loadDayDotsMonth = useCallback(async () => {
    if (!session) return;
    const start = isoDate(viewYear, viewMonth, 1);
    const end = isoDate(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());

    const { data, error } = await supabase
      .from('day_dots')
      .select('prompt_date, status, dot_index')
      .eq('user_id', session.user.id)
      .gte('prompt_date', start)
      .lte('prompt_date', end);

    if (!error) {
      setDayDotsByDate(
        Object.fromEntries((data || []).map((row) => [row.prompt_date, { status: row.status, dotIndex: row.dot_index }]))
      );
    }
  }, [session, viewYear, viewMonth]);

  // Done Routines and Reminders tiles for the month in view -- same
  // (start, end) range and same reload moments as loadDayDotsMonth, read
  // only (lib/rnrs.js fetchDonePlacementsInRange). A failed read clears
  // the map: no ticks, no error, the rest of the Calendar as usual.
  const loadRnrDoneMonth = useCallback(async () => {
    if (!session) return;
    const start = isoDate(viewYear, viewMonth, 1);
    const end = isoDate(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());
    const { data, error } = await fetchDonePlacementsInRange(session.user.id, start, end);
    if (error) {
      setRnrDoneByDate({});
      return;
    }
    const byDate = {};
    for (const p of data) {
      if (!byDate[p.plan_date]) byDate[p.plan_date] = [];
      byDate[p.plan_date].push(p);
    }
    setRnrDoneByDate(byDate);
  }, [session, viewYear, viewMonth]);

  // Same reasoning as feed.js's own loadAwards -- only feed.js's
  // handleGiveAward can ever create an award row, and
  // awards are permanent once given, so this loads once per session
  // rather than refetching on every focus like the loaders above.
  const loadAwards = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('awards')
      .select('entry_id, award_type')
      .eq('user_id', session.user.id);
    if (!error) setAwardedTypes(new Map((data || []).map((a) => [a.entry_id, a.award_type])));
  }, [session]);

  const loadMyTales = useCallback(async () => {
    if (!session) return;
    setMyTales(await fetchMyTales(session.user.id));
  }, [session]);

  useFocusEffect(useCallback(() => { loadGoals(); }, [loadGoals]));
  useFocusEffect(useCallback(() => { loadMyTales(); }, [loadMyTales]));
  useFocusEffect(useCallback(() => { loadFavorited(); }, [loadFavorited]));
  useFocusEffect(useCallback(() => { loadMonth(); }, [loadMonth]));
  useFocusEffect(useCallback(() => { loadDayDotsMonth(); }, [loadDayDotsMonth]));
  useFocusEffect(useCallback(() => { loadRnrDoneMonth(); }, [loadRnrDoneMonth]));
  useFocusEffect(useCallback(() => { loadPinBoardData(); }, [loadPinBoardData]));
  useEffect(() => { loadAwards(); }, [loadAwards]);

  // fallbackUri: see feed.js's own handleOpenPhoto for why this exists
  // (a photo-only Polaroid's tap and a text entry's linked-photo strip
  // both pass their already-resolved uri, in case the local-only lookup
  // below can't find one). Calendar's day
  // entries are always this account's own, so in practice the local
  // lookup always succeeds here -- kept for the same reason
  // resolveLinkedPhotoUris' media_url branch is kept, not because this
  // path is expected to matter yet.
  async function handleOpenPhoto(entryId, fallbackUri) {
    const photo = await getPhotoForEntry(session.user.id, entryId);
    if (photo) setEnlargeUri(photo.file_path);
    else if (fallbackUri) setEnlargeUri(fallbackUri);
  }

  const loadDayEntries = useCallback(
    async (dateStr) => {
      if (!session) return;
      setDayLoading(true);
      const { data, error } = await supabase
        .from('tickle_entries')
        .select(ENTRY_SELECT)
        .eq('user_id', session.user.id)
        .eq('entry_date', dateStr)
        .order('created_at', { ascending: false });
      if (!error) {
        const entriesData = data || [];
        setDayEntries(entriesData);
        setLinkedPhotoUris(await resolveLinkedPhotoUris(session.user.id, entriesData));
      }
      setDayLoading(false);
    },
    [session]
  );

  // Same reasoning as feed.js's own handleRelinkPhoto -- only reachable
  // from EntryCard's own owner-only placeholder, and every day entry
  // here already belongs to this account. No source: the photo grid
  // (EntryCard's "Visual find").
  // source 'byName': the file picker, so the missing photo's name can
  // be searched for (EntryCard's "Find by name").
  async function handleRelinkPhoto(entry, source) {
    const picked =
      source === 'byName'
        ? await pickImageFileByName(session.user.id)
        : await pickFromLibrary(session.user.id);
    if (picked.canceled) return;
    if (picked.error) {
      showAlert('Could not relink that photo', picked.error);
      return;
    }

    const existing = await getPhotosForEntries(session.user.id, [entry.id]);
    const oldPhotoId = existing.get(entry.id)?.id ?? null;
    await relinkPhotoToEntry(session.user.id, oldPhotoId, entry.id, picked.uri);
    setLinkedPhotoUris((prev) => new Map(prev).set(entry.id, picked.uri));
  }

  // Same reasoning as feed.js's own entries-reactive effect -- scoped
  // via .in() to just the currently-shown day's entries, not the whole
  // awarded_entries view.
  useEffect(() => {
    if (dayEntries.length === 0) {
      setAwardedPublicTypes(new Map());
      return;
    }
    supabase
      .from('awarded_entries')
      .select('entry_id, award_type')
      .in('entry_id', dayEntries.map((e) => e.id))
      .then(({ data, error }) => {
        if (error) return;
        const map = new Map();
        for (const row of data || []) {
          if (!map.has(row.entry_id)) map.set(row.entry_id, []);
          map.get(row.entry_id).push(row.award_type);
        }
        setAwardedPublicTypes(map);
      });
  }, [dayEntries]);

  // Same entries-reactive shape as feed.js's own taleBadges effect.
  useEffect(() => {
    let cancelled = false;
    fetchTaleBadges(dayEntries).then((badges) => {
      if (!cancelled) setTaleBadges(badges);
    });
    return () => {
      cancelled = true;
    };
  }, [dayEntries]);

  function selectDate(dateStr) {
    setSelectedDate(dateStr);
    loadDayEntries(dateStr);
  }

  function goToMonth(delta) {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month < 0) {
      month = 11;
      year -= 1;
    } else if (month > 11) {
      month = 0;
      year += 1;
    }
    setViewMonth(month);
    setViewYear(year);
    setSelectedDate(null);
    setDayEntries([]);
    setOpenPill(null);
  }

  const goalsById = Object.fromEntries(goals.map((g) => [g.id, g]));
  // Achieved goals are never offered as a new tag target in the picker
  // — they only ever appear read-only, on entries already tagged before
  // achievement (resolved via goalsById above, achieved or not).
  const activeGoals = goals.filter((g) => !g.achieved_at);

  async function handleToggleFavorite(entryId) {
    const isFavorited = favoritedIds.has(entryId);
    const previous = favoritedIds;

    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (isFavorited) next.delete(entryId);
      else next.add(entryId);
      return next;
    });

    const { error } = isFavorited
      ? await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('entry_id', entryId)
      : await supabase.from('favorites').insert({ user_id: session.user.id, entry_id: entryId });

    if (error) {
      setFavoritedIds(previous);
      showSaveFailed();
    }
  }

  async function handleToggleVisibility(entry) {
    const newVisibility = entry.visibility === 'public' ? 'private' : 'public';

    // Ripple soft cap (lib/freemiumCaps.js) -- every private -> public
    // flip draws one from its bucket, re-Ripples included. Checked
    // before any branch below so a blocked flip never uploads anything.
    if (newVisibility === 'public') {
      const rippleFeature = rippleFeatureFor(entry, linkedPhotoUris.get(entry.id) || null);
      if (rippleFeature) {
        const capResult = await checkAndConsumeWeeklyCap(profile, rippleFeature);
        if (capResult.blocked) {
          alertCapBlocked(capResult, profile);
          return;
        }
      }
    }

    // Photo-only entries going private -> public need the actual image
    // uploaded first (see lib/photoTickleStorage.js) -- not the plain
    // single-field flip below. Not optimistic like the plain path: this
    // is a real multi-step async operation (upload, then a combined DB
    // write) with real failure modes, so nothing changes on screen until
    // it's actually succeeded, rather than flashing "public" and then
    // reverting it a moment later.
    if (entry.entry_kind === 'photo_only' && newVisibility === 'public') {
      const photoUri = linkedPhotoUris.get(entry.id) || null;
      if (!photoUri) {
        showAlert(
          "Can't make this public yet",
          "This photo isn't available on this device right now — relink it, then try again."
        );
        return;
      }
      try {
        const mediaUrl = await makePhotoTicklePublic(entry, photoUri);
        setDayEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, visibility: 'public', media_url: mediaUrl } : e))
        );
      } catch (err) {
        console.error('handleToggleVisibility: photo upload failed', err);
        // The raw error goes to the log above only; people see the
        // friendly sentence, never database or Storage wording.
        showAlert(
          "Couldn't make this public",
          'Something went wrong uploading this photo — try again.'
        );
      }
      return;
    }

    // Photo-only entries going public -> private genuinely remove the
    // Storage object too (see lib/photoTickleStorage.js's own comment)
    // -- the bucket is fully public-read, so leaving the object in
    // place would mean "private" only hides it from this app's own UI,
    // not a real access revocation. Same non-optimistic shape as the
    // going-public branch above, for the same reason: a real async
    // Storage operation with real failure modes, not an instant flip.
    if (entry.entry_kind === 'photo_only' && newVisibility === 'private') {
      try {
        await makePhotoTicklePrivate(entry);
        setDayEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, visibility: 'private', media_url: null } : e))
        );
      } catch (err) {
        console.error('handleToggleVisibility: photo removal failed', err);
        showAlert(
          "Couldn't make this private",
          'Something went wrong removing this photo — try again.'
        );
      }
      return;
    }

    // A text entry with a Tickle-a-Photo link gets the same upload
    // treatment on Ripple as a photo-only entry -- same underlying
    // mechanic (lib/photoTickleStorage.js). Unlike photo-only, a
    // missing/unresolvable local photo does NOT block the share here:
    // most text entries have no linked photo at all, and even one that
    // does has real text content of its own, so an unresolvable bonus
    // photo just falls through to the plain flip below and shares as
    // text only, rather than blocking the whole Ripple the way
    // photo-only's own no-photo case does above.
    if (entry.entry_kind === 'text' && newVisibility === 'public') {
      const photoUri = linkedPhotoUris.get(entry.id) || null;
      if (photoUri) {
        try {
          const mediaUrl = await makePhotoTicklePublic(entry, photoUri);
          setDayEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, visibility: 'public', media_url: mediaUrl } : e))
          );
        } catch (err) {
          console.error('handleToggleVisibility: linked-photo upload failed', err);
          showAlert(
            "Couldn't make this public",
            'Something went wrong uploading this photo — try again.'
          );
        }
        return;
      }
    }

    // Symmetric to the block above -- an already-public text entry
    // whose linked photo was actually uploaded (media_url set) gets the
    // same Storage removal as a photo-only entry going private. Gated
    // on media_url itself rather than a fresh local-link lookup, since
    // only an entry that went through the upload branch above ever has
    // media_url set for entry_kind='text'.
    if (entry.entry_kind === 'text' && newVisibility === 'private' && entry.media_url) {
      try {
        await makePhotoTicklePrivate(entry);
        setDayEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, visibility: 'private', media_url: null } : e))
        );
      } catch (err) {
        console.error('handleToggleVisibility: linked-photo removal failed', err);
        showAlert(
          "Couldn't make this private",
          'Something went wrong removing this photo — try again.'
        );
      }
      return;
    }

    const previous = dayEntries;
    setDayEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, visibility: newVisibility } : e)));

    const { error } = await supabase
      .from('tickle_entries')
      .update({ visibility: newVisibility })
      .eq('id', entry.id);

    if (error) {
      setDayEntries(previous);
      showSaveFailed();
    }
  }

  async function handleDeleteEntry(entry) {
    const previous = dayEntries;
    setDayEntries((prev) => prev.filter((e) => e.id !== entry.id));

    // Best-effort, never blocks the actual delete below -- see
    // deletePhotoTickleMedia's own comment.
    await deletePhotoTickleMedia(entry);

    const { error } = await supabase.from('tickle_entries').delete().eq('id', entry.id);
    if (error) {
      setDayEntries(previous);
      showSaveFailed();
      return;
    }
    // Drops a Quick Tickle's "Tickle it" dismissal, if it had one.
    forgetQuickTickle(entry.id);

    // Keep the month grid's count (and so its hollow dot) in sync
    // without a full reload.
    setCountsByDate((prev) => {
      if (!selectedDate || !prev[selectedDate]) return prev;
      const next = { ...prev };
      const remaining = next[selectedDate] - 1;
      if (remaining <= 0) delete next[selectedDate];
      else next[selectedDate] = remaining;
      return next;
    });
  }

  async function assignGoal(entryId, goalId) {
    const currentGoalId = dayEntries.find((e) => e.id === entryId)?.goal_id ?? null;
    setPickerEntryId(null);
    await assignEntryGoal({ entryId, goalId, currentGoalId, setEntries: setDayEntries });
  }

  async function assignTale(entryId, taleId) {
    const currentTaleId = dayEntries.find((e) => e.id === entryId)?.tale_id ?? null;
    setTalePickerEntryId(null);
    const { error } = await assignEntryTale({ entryId, taleId, currentTaleId, setEntries: setDayEntries });
    if (error) {
      console.warn('Multickle tag failed', error);
      showAlert("Couldn't update the Blogbit", 'Please try again.');
    }
  }

  async function handleShare(entry, captionId) {
    setShareEntryId(null);
    const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);
    const photo = await getPhotoForEntry(session.user.id, entry.id);

    let cardImageUri;
    if (photo) {
      try {
        cardImageUri = await captureCard({
          photo,
          captionLabel: caption.label,
          textContent: entry.text_content,
          accentColor: accentFor(profile?.accent_theme).card,
        });
      } catch (err) {
        // Falls back to the text-only share below rather than blocking
        // the share outright — capture failure shouldn't cost the person
        // their share.
        console.error('handleShare: card capture failed, falling back to text share', err);
      }
    }

    const result = await shareEntry({ profile, entry, captionId, cardImageUri, logCaptionShare: true });
    if (result.blocked) alertCapBlocked(result, profile);
  }

  // Thin wrapper around lib/sharing.js's sharePhotoOnlyEntry (shared
  // with home.js/feed.js's own Share buttons) -- this file's job is
  // just resolving this screen's own already-loaded linkedPhotoUris into a
  // uri and turning the returned status into the right Alert; the
  // actual skip-ShareModal / bake-in-the-Vibe-label decision logic lives
  // there once, not duplicated per screen.
  async function handlePhotoOnlyShare(entry) {
    const result = await sharePhotoOnlyEntry({
      profile,
      entry,
      photoUri: linkedPhotoUris.get(entry.id) || null,
      captureCard,
      accentColor: accentFor(profile?.accent_theme).card,
    });

    if (result.missingPhoto) {
      showAlert(
        "Can't share yet",
        "This photo isn't available on this device right now — relink it, then try sharing again."
      );
    } else if (result.blocked) {
      alertCapBlocked(result, profile);
    } else if (result.captureFailed) {
      showAlert("Couldn't share", 'Something went wrong preparing this photo to share — try again.');
    }
  }

  // The selected day's pill counts and Goals list come from the day's
  // already-loaded entries, so a delete or a Goal-tag change updates
  // them in place with no extra query.
  const goalDayEntries = dayEntries.filter((e) => e.goal_id);
  const dayPills = [
    { key: 'tickles', label: 'Tickles', count: dayEntries.length },
    { key: 'goals', label: 'Goals', count: goalDayEntries.length },
  ];

  const pickerEntry = dayEntries.find((e) => e.id === pickerEntryId) || null;
  const talePickerEntry = dayEntries.find((e) => e.id === talePickerEntryId) || null;
  const shareTargetEntry = dayEntries.find((e) => e.id === shareEntryId) || null;
  const shareStat = useShareStatus(profile, !!shareTargetEntry);
  const shareBlocked = !!shareStat && !shareStat.unlimited && shareStat.remaining <= 0;

  const weekStartDay = profile?.week_start_day ?? DEFAULT_WEEK_START_DAY;
  const weekdayLabels = [...WEEKDAY_LABELS.slice(weekStartDay), ...WEEKDAY_LABELS.slice(0, weekStartDay)];
  // Blank cells before the 1st: how many columns it sits after the
  // week's first day.
  const leadingBlanks = (new Date(viewYear, viewMonth, 1).getDay() - weekStartDay + 7) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const todayStr = isoDate(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedDayDotsEntry = selectedDate ? dayDotsByDate[selectedDate] : null;
  const selectedRnrDone = (selectedDate && rnrDoneByDate[selectedDate]) || [];

  function renderEntryCard(item) {
    return (
      <EntryCard
        key={item.id}
        item={item}
        currentUserId={session.user.id}
        showMineActions
        // Every Calendar card is your own, so no author row -- same as
        // Tickle Stash's Mine tab (Task 3 S4).
        showAuthor={false}
        isHighlighted={false}
        isFollowing={false}
        isFavorited={favoritedIds.has(item.id)}
        isLiked={false}
        taggedGoal={item.goal_id ? goalsById[item.goal_id] : null}
        taleBadge={taleBadges.get(item.id) || null}
        hasLinkedPhoto={photoLinkedIds.has(item.id)}
        photoUri={linkedPhotoUris.get(item.id) || null}
        awardType={awardedTypes.get(item.id) || null}
        publicAwardTypes={awardedPublicTypes.get(item.id) || []}
        onOpenPhoto={handleOpenPhoto}
        onRelinkPhoto={handleRelinkPhoto}
        onPickGoal={setPickerEntryId}
        onPickTale={setTalePickerEntryId}
        onShare={() => (item.entry_kind === 'photo_only' ? handlePhotoOnlyShare(item) : setShareEntryId(item.id))}
        onToggleFavorite={handleToggleFavorite}
        onToggleVisibility={handleToggleVisibility}
        onDelete={handleDeleteEntry}
      />
    );
  }

  return (
    <>
      <WallpaperBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: styles.content.paddingBottom + tabBarHeight },
        ]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>Calendar</Text>
          <CornerNav style={styles.cornerNavInline} />
        </View>

        <View style={styles.monthNavRow}>
          <TouchableOpacity onPress={() => goToMonth(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={C.subtext} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => goToMonth(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-forward" size={22} color={C.subtext} />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.weekdayRow}>
            {weekdayLabels.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>{label}</Text>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator color={C.rust} style={styles.loader} />
          ) : (
            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={i} style={styles.dayCell} />;

                const dateStr = isoDate(viewYear, viewMonth, day);
                const count = countsByDate[dateStr] || 0;
                const isSelected = selectedDate === dateStr;
                const isToday = dateStr === todayStr;
                const dotEntry = dayDotsByDate[dateStr];
                const dotSize = dotEntry?.status === 'answered' ? DAY_DOTS_SIZES[dotEntry.dotIndex] : null;
                const a11yParts = [
                  new Date(viewYear, viewMonth, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
                  count === 0 ? 'no Tickles' : `${count} ${count === 1 ? 'Tickle' : 'Tickles'}`,
                ];
                if (dotEntry?.status === 'answered') a11yParts.push(`Day Dot ${DAY_DOTS_SIZE_WORDS[dotEntry.dotIndex]}`);
                else if (dotEntry?.status === 'skipped') a11yParts.push('Day Dot skipped');
                const rnrDone = rnrDoneByDate[dateStr]?.length || 0;
                if (rnrDone > 0) {
                  a11yParts.push(`${rnrDone} ${rnrDone === 1 ? 'Nudge or Note' : 'Nudges & Notes'} done`);
                }

                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayCell, isSelected && { backgroundColor: accentCard }]}
                    onPress={() => selectDate(dateStr)}
                    accessibilityRole="button"
                    accessibilityLabel={a11yParts.join(', ')}
                    accessibilityState={{ selected: isSelected }}
                  >
                    {/* Done Routines and Reminders: a small tick in the
                        top-right corner, out of the layout flow. On the
                        selected (accent) cell it takes the cell's text
                        colour, like the other marks, so it stays visible. */}
                    {rnrDone > 0 && (
                      <Ionicons
                        name="checkmark"
                        size={RNR_TICK_SIZE}
                        color={isSelected ? accentCardText : C.subtext}
                        style={styles.rnrTick}
                        accessible={false}
                        importantForAccessibility="no"
                      />
                    )}
                    <Text
                      style={[
                        styles.dayLabel,
                        isToday && !isSelected && { color: accentDark, fontWeight: '700' },
                        isSelected && { color: accentCardText },
                      ]}
                    >
                      {day}
                    </Text>
                    {/* One mark per day: the Day Dot if there is a row,
                        else a small hollow dot if the day has Tickles,
                        else nothing. */}
                    <View style={styles.dayMarkSlot}>
                      {dotEntry?.status === 'answered' ? (
                        <View
                          style={[
                            styles.dayDotsDot,
                            {
                              width: dotSize, height: dotSize, borderRadius: dotSize / 2,
                              backgroundColor: isSelected ? accentCardText : withAlpha(accentCard, 0.35),
                              borderColor: isSelected ? accentCardText : darken(accentCard, 0.15),
                            },
                          ]}
                        />
                      ) : dotEntry?.status === 'skipped' ? (
                        <View
                          style={[
                            styles.dayDotsSkipMark,
                            { backgroundColor: isSelected ? accentCardText : C.subtext },
                          ]}
                        />
                      ) : count > 0 ? (
                        <View
                          style={[styles.hasTicklesDot, { borderColor: isSelected ? accentCardText : accentDark }]}
                        />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {selectedDate && (
          <View style={styles.dayEntriesSection}>
            <Text style={styles.dayEntriesTitle}>
              {new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </Text>
            {/* Day Dots isn't a Tickle (no tickle_entries row). A dotted
                day shows only its dot on the grid; a skipped day gets
                this one readout line rather than a pill. */}
            {selectedDayDotsEntry?.status === 'skipped' && (
              <View style={styles.dayDotsDetailRow}>
                <View style={[styles.dayDotsSkipMark, { backgroundColor: C.subtext }]} />
                <Text style={styles.dayDotsDetailText}>Skipped</Text>
              </View>
            )}

            {/* Done Routines and Reminders, from the month's data (no
                extra read). Plain rows like the Day Dot line: not
                Tickles, no Vibe colour, not tappable. */}
            {selectedRnrDone.length > 0 && (
              <View style={styles.rnrSection}>
                <Text style={styles.rnrSectionTitle} accessibilityRole="header">Nudges & Notes</Text>
                {selectedRnrDone.map((p) => (
                  <View
                    key={p.id}
                    style={styles.rnrRow}
                    accessible
                    accessibilityLabel={`${p.label}, ${RNR_SLOT_LABELS[p.slot]}, done`}
                  >
                    <Ionicons name="checkmark-circle-outline" size={RNR_DETAIL_ICON_SIZE} color={C.subtext} />
                    <Text style={styles.rnrRowText}>
                      {p.label}
                      <Text style={styles.rnrRowSlot}>{`  ${RNR_SLOT_LABELS[p.slot]}`}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Counts are left off while the day is loading, so a
                previous day's numbers never show under this day's date. */}
            <View style={styles.dayPillsRow}>
              {dayPills.map((pill) => {
                const isOpen = openPill === pill.key;
                const label = dayLoading ? pill.label : `${pill.label} ${pill.count}`;
                return (
                  <TouchableOpacity
                    key={pill.key}
                    hitSlop={BUTTON_HIT_SLOP}
                    style={[
                      styles.dayPill,
                      { borderColor: accentCard },
                      isOpen && styles.dayPillOpen,
                      isOpen && { borderColor: accentDark, backgroundColor: withAlpha(accentCard, 0.18) },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => setOpenPill(isOpen ? null : pill.key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={label}
                  >
                    <Text style={styles.dayPillLabel}>{label}</Text>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.subtext} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {openPill === null ? (
              <Text style={styles.dayPillsHint}>Tap a pill to see the detail.</Text>
            ) : dayLoading ? (
              <ActivityIndicator color={C.rust} style={styles.loader} />
            ) : openPill === 'tickles' ? (
              dayEntries.length === 0 ? (
                <Text style={styles.emptyText}>No Tickles this day.</Text>
              ) : (
                <>
                  <View style={styles.vibeCountRow}>
                    {ALL_NATURES.map((nature) => {
                      const n = dayEntries.filter((e) => e.tickle_nature === nature).length;
                      return (
                        <View
                          key={nature}
                          style={styles.vibeCountChip}
                          accessible
                          accessibilityLabel={`${NATURE_LABELS[nature]}: ${n}`}
                        >
                          <NatureIcon nature={nature} size={14} color={vibeIconColor(nature)} />
                          <Text style={styles.vibeCountText}>{n}</Text>
                        </View>
                      );
                    })}
                  </View>
                  {dayEntries.map(renderEntryCard)}
                </>
              )
            ) : goalDayEntries.length === 0 ? (
              <Text style={styles.emptyText}>No Goal-tagged Tickles this day.</Text>
            ) : (
              goalDayEntries.map(renderEntryCard)
            )}
          </View>
        )}
      </ScrollView>
      </WallpaperBackground>

      <GoalTagModal
        entry={pickerEntry}
        goals={activeGoals}
        taggedGoal={pickerEntry?.goal_id ? goalsById[pickerEntry.goal_id] : null}
        onAssign={(goalId) => assignGoal(pickerEntry.id, goalId)}
        onDismiss={() => setPickerEntryId(null)}
      />

      <TaleTagModal
        entry={talePickerEntry}
        tales={myTales}
        onAssign={(taleId) => assignTale(talePickerEntry.id, taleId)}
        onDismiss={() => setTalePickerEntryId(null)}
      />

      <ShareModal
        visible={shareTargetEntry}
        captions={SHARE_CAPTIONS}
        blocked={shareBlocked}
        cap={shareStat?.cap}
        profile={profile}
        onConfirm={(captionId) => handleShare(shareTargetEntry, captionId)}
        onDismiss={() => setShareEntryId(null)}
      />

      <PhotoEnlargeModal uri={enlargeUri} onDismiss={() => setEnlargeUri(null)} />
      {hiddenCard}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  // Cancels CornerNav's own marginBottom now that it's nested inside
  // titleRow instead of standing alone -- same reasoning/pattern as
  // home.js's own cornerNavInline.
  cornerNavInline: { marginBottom: 0 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, flexShrink: 1 },

  monthNavRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  monthLabel: { fontSize: 16, fontWeight: '700', color: C.rustDark },

  calendarCard: {
    backgroundColor: C.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayLabel: {
    width: '14.28%', textAlign: 'center', fontSize: 12, fontWeight: '600', color: C.subtext,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%', aspectRatio: 1, borderRadius: 8, position: 'relative',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  dayLabel: { fontSize: 14, color: C.text },
  // Fixed height (fits DAY_DOTS_SIZES' largest 18px dot) so the day
  // number sits at the same spot whichever mark -- or none -- is drawn.
  dayMarkSlot: { alignItems: 'center', justifyContent: 'center', height: 20, marginTop: 2 },
  dayDotsDot: { borderWidth: 1.5 },
  dayDotsSkipMark: { width: 10, height: 2, borderRadius: 1 },
  // A day with Tickles but no Day Dot row.
  hasTicklesDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5 },

  loader: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 12 },

  dayEntriesSection: { marginTop: 20 },
  dayEntriesTitle: { fontSize: 16, fontWeight: '700', color: C.rustDark, marginBottom: 10 },

  dayDotsDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  dayDotsDetailText: { fontSize: 14, color: C.text, fontWeight: '600' },

  // Done Routines and Reminders: corner tick in the day cell (out of the
  // flow, so nothing in the cell moves) and the day detail's plain list,
  // in the Day Dot line's look.
  rnrTick: { position: 'absolute', top: RNR_TICK_INSET, right: RNR_TICK_INSET },
  rnrSection: { marginBottom: 10 },
  rnrSectionTitle: { fontSize: 13, fontWeight: '700', color: C.rustDark, marginBottom: 6 },
  rnrRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  rnrRowText: { flexShrink: 1, fontSize: 14, color: C.text, fontWeight: '600' },
  rnrRowSlot: { fontSize: 13, color: C.subtext, fontWeight: '400' },

  // Home's statPill look (card fill, accent border, borderRadius 999 so
  // it stays a pill at any height) at the app-wide pill height (30dp,
  // 44dp to tap; lib/buttonSize.js). minHeight, not height, so the label
  // can wrap to two lines at large font scales; the row stretches both
  // pills to the taller one.
  dayPillsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dayPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: BUTTON_HEIGHT, paddingHorizontal: 12,
    backgroundColor: C.card, borderWidth: 1.5, borderRadius: 999,
  },
  dayPillOpen: { borderWidth: 2 },
  dayPillLabel: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: C.text, textAlign: 'center' },
  dayPillsHint: { fontSize: 14, color: C.subtext, textAlign: 'center', marginTop: 2 },

  // Four equal chips, one per ALL_NATURES entry, above the day's cards.
  vibeCountRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  vibeCountChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 6, borderRadius: 999,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  vibeCountText: { fontSize: 13, fontWeight: '700', color: C.text },
});
