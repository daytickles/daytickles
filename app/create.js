import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Platform, Keyboard,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken, textOn, natureTintColor, vibeIconColor, withAlpha, NATURE_ORDER, NATURE_LABELS } from '../lib/theme';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';
import NatureIcon from '../components/NatureIcon';
import { File } from 'expo-file-system';
import { initPinBoardDb, linkPhotoToEntry, listPinnedPhotos, getPhotoForEntry } from '../lib/pinBoardDb';
import { localDateString } from '../lib/week';
import { alertCapBlocked, checkAndConsumeWeeklyCap, rippleFeatureFor } from '../lib/freemiumCaps';
import { makePhotoTicklePublic, makePhotoTicklePrivate } from '../lib/photoTickleStorage';
import { showAlert } from '../lib/themedAlert';
import { assignEntryTale, fetchMyTales } from '../lib/tales';

const MAX_LEN = 500;

// Labels come from lib/theme.js's NATURE_LABELS, so the picker always
// matches the Vibe names used everywhere else.
const TICKLE_NATURE_OPTIONS = NATURE_ORDER.map((id) => ({ id, label: NATURE_LABELS[id] }));

const DAY_JOURNAL_OPTION = { id: 'day_journal', label: NATURE_LABELS.day_journal };

export default function Create() {
  const { session, profile } = useAuth();
  const { entryId, pinnedPhotoId } = useLocalSearchParams();
  const accent = accentFor(profile?.accent_theme);
  const accentDark = darken(accent.card, 0.35);
  const accentDarkText = textOn(accentDark);

  const [text, setText] = useState('');
  const [tickleNature, setTickleNature] = useState(null);
  const [shareToFeed, setShareToFeed] = useState(false);
  // What the row was when this screen opened -- only a private -> public
  // change on save draws from the Ripple cap, not every save of an
  // already-public entry.
  const [wasPublic, setWasPublic] = useState(false);
  // Edit mode: the row's media_url, set only while its linked photo is
  // uploaded (lib/photoTickleStorage.js).
  const [mediaUrl, setMediaUrl] = useState(null);
  // Local file of the linked Pin Board photo (the pinnedPhotoId one on a
  // new Tickle, or the entry's existing link in Edit), or null when there
  // is none or the file is gone from this device.
  const [linkedPhotoPath, setLinkedPhotoPath] = useState(null);
  // "Connect to a Multickle" (shown only while Ripple is on). myTales is
  // the owner's list from fetchMyTales -- [] on any load error, which
  // simply hides the section. originalTaleId is the row's tale_id in
  // Edit (null on a new Tickle); selectedTaleId is the pick on screen.
  const [myTales, setMyTales] = useState([]);
  const [originalTaleId, setOriginalTaleId] = useState(null);
  const [selectedTaleId, setSelectedTaleId] = useState(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(!!entryId);

  // Edit mode: seed every field from the existing row, including
  // shareToFeed from its actual current visibility rather than leaving
  // it at the blank-state default of false — otherwise saving an edit
  // to an already-public entry would silently flip it back to private.
  useEffect(() => {
    if (!entryId) return;

    (async () => {
      const { data, error } = await supabase
        .from('tickle_entries')
        .select('text_content, tickle_nature, visibility, media_url, tale_id')
        .eq('id', entryId)
        .single();

      if (!error && data) {
        setText(data.text_content);
        setTickleNature(data.tickle_nature);
        setShareToFeed(data.visibility === 'public');
        setWasPublic(data.visibility === 'public');
        setMediaUrl(data.media_url);
        setOriginalTaleId(data.tale_id ?? null);
        setSelectedTaleId(data.tale_id ?? null);
      }
      setLoadingEntry(false);
    })();
  }, [entryId]);

  // Never blocks anything: a failed load leaves myTales empty and the
  // Multickle section simply doesn't show.
  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    fetchMyTales(session.user.id)
      .then((tales) => {
        if (!cancelled) setMyTales(tales);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Finds the linked photo's local file, same existence check as
  // feed.js's resolveLinkedPhotoUris. Local-only (lib/pinBoardDb.js), so
  // it reads nothing from Supabase.
  useEffect(() => {
    if (!session || (!pinnedPhotoId && !entryId)) return undefined;
    const userId = session.user.id;
    let cancelled = false;
    (async () => {
      try {
        await initPinBoardDb(userId);
        const photo = pinnedPhotoId
          ? (await listPinnedPhotos(userId)).find((p) => p.id === Number(pinnedPhotoId))
          : await getPhotoForEntry(userId, entryId);
        const path = photo && new File(photo.file_path).exists ? photo.file_path : null;
        if (!cancelled) setLinkedPhotoPath(path);
      } catch {
        // No photo found: the Tickle saves and Ripples as text only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, pinnedPhotoId, entryId]);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus('Write a little first.');
      return;
    }
    setSaving(true);
    setStatus('');

    // Rippling a Tickle that has a linked photo (new, or Edit private ->
    // public) uploads that photo too, the same as the Ripple toggles in
    // Tickle Stash/Calendar (lib/photoTickleStorage.js). photoToShare is
    // its local file, or null when there's no photo to send up.
    const photoToShare = shareToFeed && !wasPublic ? linkedPhotoPath : null;

    // Ripple soft cap (lib/freemiumCaps.js), same bucket choice as the
    // Tickle Stash toggle: Ripples with a photo when one goes up too.
    if (shareToFeed && !wasPublic) {
      const capResult = await checkAndConsumeWeeklyCap(profile, rippleFeatureFor({ entry_kind: 'text' }, photoToShare));
      if (capResult.blocked) {
        setSaving(false);
        alertCapBlocked(capResult, profile);
        return;
      }
    }

    // Edit, public -> private with an uploaded photo: remove the Storage
    // object first (makePhotoTicklePrivate clears media_url and sets
    // private in one write), so "private" really is private. If that
    // fails nothing is saved and the Tickle stays public.
    if (entryId && wasPublic && !shareToFeed && mediaUrl) {
      try {
        await makePhotoTicklePrivate({ id: entryId, user_id: session.user.id, media_url: mediaUrl });
      } catch (err) {
        console.error('handleSave: linked-photo removal failed', err);
        setSaving(false);
        showAlert(
          "Couldn't make this private",
          'Something went wrong removing this photo — try again.'
        );
        return;
      }
    }

    // With a photo to share, the row is saved private first and only
    // makePhotoTicklePublic below makes it public, together with
    // media_url -- so a public Tickle without its photo never exists.
    const visibility = shareToFeed && !photoToShare ? 'public' : 'private';

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
          tickle_nature: tickleNature,
          visibility,
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
          tickle_nature: tickleNature,
          visibility,
        })
        .select('id')
        .single();
      error = insertResult.error;
      savedEntryId = insertResult.data?.id;
    }

    if (error) {
      setSaving(false);
      console.warn('handleSave: save failed', error);
      setStatus("Couldn't save that — please try again.");
      return;
    }

    // The Pin Board link is local-only — never a field on the synced
    // row itself (see lib/pinBoardDb.js) — so it's created here, after
    // the save succeeds, rather than passed as part of the insert.
    if (pinnedPhotoId && savedEntryId) {
      await linkPhotoToEntry(session.user.id, Number(pinnedPhotoId), savedEntryId);
    }

    // Upload, then media_url + public in one write. On failure the
    // Tickle stays saved as private (never Rippled as text only), with
    // the same alert as Tickle Stash's toggle. Leaving the screen after
    // the alert also keeps a second Save from inserting it twice.
    if (photoToShare && savedEntryId) {
      try {
        await makePhotoTicklePublic({ id: savedEntryId, user_id: session.user.id, media_url: null }, photoToShare);
      } catch (err) {
        console.error('handleSave: linked-photo upload failed', err);
        setSaving(false);
        showAlert(
          "Couldn't make this public",
          'Something went wrong uploading this photo — try again.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }
    }

    // Multickle connection, only once the row is public (the guard
    // trigger enforce_tale_chapter_rules refuses a private one, and a
    // photo Tickle only turns public in makePhotoTicklePublic above).
    // Same write as "Add to a Multickle…"/"Change Multickle…", so the
    // follower "Tic" notification fires exactly as it does there. No-op
    // when the pick didn't change. With Ripple off nothing is written:
    // an existing tag stays across Un-Ripple, same as Tickle Stash's
    // toggle. The Tickle is already saved, so a failure here only says so.
    if (shareToFeed && savedEntryId) {
      let taleError = null;
      try {
        ({ error: taleError } = await assignEntryTale({
          entryId: savedEntryId,
          taleId: selectedTaleId,
          currentTaleId: originalTaleId,
          // No loaded list on this screen to update optimistically.
          setEntries: () => {},
        }));
      } catch (err) {
        taleError = err;
      }
      if (taleError) {
        console.warn('handleSave: Multickle tag failed', taleError);
        setSaving(false);
        showAlert(
          "Couldn't update the Multickle",
          'Your Tickle was saved. You can try again from its ⋯ menu.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }
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

  // The nature picker (Made me smile / Paying forward / For me / My Day)
  // always shows now -- tickle_nature_enabled's gating was removed
  // earlier, and day_journal_enabled's gating is removed here too. My
  // Day is a permanent 4th option in the same row, contributing into
  // the same single-select tickle_nature field as the three Vibes.
  const natureOptions = [...TICKLE_NATURE_OPTIONS, DAY_JOURNAL_OPTION];

  // Ongoing Multickles only (a Completed one takes no new Tics), plus the
  // entry's own current one in Edit even if it's since Completed, so it
  // shows as selected and can be removed -- same as TaleTagModal.
  const taleOptions = myTales.filter((t) => !t.completed_at || t.id === originalTaleId);

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

      <Text style={styles.title}>{entryId ? 'Edit your Tickle' : 'Tickle it.'}</Text>
      {!!pinnedPhotoId && <Text style={styles.photoLinkHint}>📌 Linking your Tickle Pic</Text>}

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(t) => setText(t.slice(0, MAX_LEN))}
        maxLength={MAX_LEN}
        multiline
        textAlignVertical="top"
      />
      <Text style={styles.counter}>{text.length}/{MAX_LEN}</Text>

      <Text style={styles.label}>Pick your Vibe.</Text>
      <View style={styles.natureRow}>
        {natureOptions.map((opt) => {
          const selected = tickleNature === opt.id;
          // natureTintColor: VIBE_COLORS for the three Vibes, C.rust for
          // My Day (lib/theme.js) -- My Day still isn't in VIBE_COLORS or
          // NATURE_ORDER, so it never becomes a tracked Vibe elsewhere.
          const tintColor = natureTintColor(opt.id);
          // vibeIconColor, not the raw tintColor -- same reasoning as
          // EntryCard.js's own leading icon (Tickle Stash): at small
          // icon size on a light/near-white backing, several raw Vibe
          // colors fail WCAG's 3:1 minimum for graphical objects, so the
          // contrast-corrected variant is the actually-reused value, not
          // just the swatch color. For My Day it returns plain C.rust.
          const unselectedIconColor = vibeIconColor(opt.id);
          // Selected state keeps its own existing accentDark fill
          // untouched -- the per-Vibe tint only applies while unselected,
          // so the icon switches to accentDarkText on selection too
          // (its own color wouldn't have reliable contrast against an
          // arbitrary accent color).
          const iconColor = selected ? accentDarkText : unselectedIconColor;
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => {
                Keyboard.dismiss();
                setTickleNature(selected ? null : opt.id);
              }}
              style={[
                styles.natureOption,
                { backgroundColor: withAlpha(tintColor, 0.14), borderColor: tintColor },
                selected && { backgroundColor: accentDark, borderColor: accentDark },
              ]}
            >
              <NatureIcon nature={opt.id} size={16} color={iconColor} />
              <Text style={[styles.natureOptionLabel, selected && { color: accentDarkText }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.shareRow}>
        <Text style={styles.label}>Good Vibe? – Let it Ripple.</Text>
        <Switch
          value={shareToFeed}
          onValueChange={(on) => {
            setShareToFeed(on);
            // Off clears the pick (back to the row's stored tag in Edit,
            // which nothing below touches while Ripple is off).
            if (!on) setSelectedTaleId(originalTaleId);
          }}
          trackColor={{ false: C.border, true: accentDark }}
          thumbColor={C.card}
        />
      </View>
      {/* Not shown for an already-public Tickle whose photo was never
          uploaded: saving it again doesn't share the photo. */}
      {!!linkedPhotoPath && (!wasPublic || !!mediaUrl) && (
        <Text style={styles.rippleHint}>Rippling shares this photo too.</Text>
      )}

      {shareToFeed && taleOptions.length > 0 && (
        <View style={styles.taleSection} accessibilityRole="radiogroup" accessibilityLabel="Connect to a Multickle">
          <Text style={styles.label}>Connect to a Multickle</Text>
          <View style={styles.talePillsWrap}>
            {taleOptions.map((t) => {
              const selected = t.id === selectedTaleId;
              const title = t.completed_at ? `${t.title} (complete)` : t.title;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.taleRow, selected && styles.taleRowSelected]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSelectedTaleId(selected ? null : t.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={title}
                  accessibilityHint={selected ? 'Tap again to not connect it' : undefined}
                >
                  <Text style={styles.taleRowLabel} numberOfLines={1}>{title}</Text>
                  {selected && <Ionicons name="checkmark" size={18} color={C.rust} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {!!status && <Text style={styles.status}>{status}</Text>}
      <Button
        title={saving ? 'Saving...' : 'Save'}
        onPress={handleSave}
        disabled={saving}
        variant="secondary"
        style={styles.saveShadow}
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
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    padding: 12, minHeight: 120, fontSize: 16,
    backgroundColor: C.card, color: C.text,
  },
  counter: { alignSelf: 'flex-end', color: C.subtext, fontSize: 12, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 14, color: C.subtext },
  // 2x2 grid (was a single row of 4) -- width:'48%' + space-between
  // rather than flex:1 + gap, so the row math stays simple regardless
  // of how many options ever end up in this array.
  natureRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    rowGap: 10, marginTop: 8, marginBottom: 20,
  },
  natureOption: {
    width: '48%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 20, borderWidth: 1,
  },
  natureOptionLabel: { fontSize: 12, fontWeight: '600', color: C.subtext, textAlign: 'center' },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 28,
  },
  // photoLinkHint's type, pulled up under shareRow's 28dp bottom margin.
  rippleHint: { fontSize: 13, color: C.subtext, marginTop: -20, marginBottom: 20 },
  // Pulled up under shareRow's 28dp (or rippleHint's 20dp) bottom margin.
  // Choices look like Home's "Multickles you follow" pills: values copied
  // from home.js's goalPill + redeemPill + goalPillLabel (kept local, as
  // home.js does with create.js's natureOption), wrapping rather than
  // scrolling so every choice is visible. maxWidth caps a long title so
  // only it truncates.
  taleSection: { marginTop: -12, marginBottom: 24 },
  talePillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  taleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    minHeight: 40, maxWidth: 240, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1,
    backgroundColor: withAlpha(C.amberBg, 0.25), borderColor: C.amberDark,
  },
  // A 2dp C.rust border marks the pick (with the checkmark); padding
  // drops by the extra 1dp so the pill doesn't grow.
  taleRowSelected: { borderWidth: 2, borderColor: C.rust, paddingVertical: 7, paddingHorizontal: 11 },
  taleRowLabel: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: C.text },
  status: { marginBottom: 12, color: C.error, textAlign: 'center' },
  // Same shadow as Home's own New Tickle button (home.js's
  // newTickleShadow) -- identical values, this app's one deliberate
  // exception to its usual no-shadow-on-cards convention, copied
  // verbatim rather than centralized (matching how PolaroidCard.js/
  // EntryCard.js's own shared shadow language is already duplicated
  // per-file elsewhere in this codebase).
  saveShadow: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
});
