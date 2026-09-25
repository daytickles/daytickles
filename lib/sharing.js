// lib/sharing.js
//
// Native one-to-one sharing + the Polaroid/external-share soft cap --
// one weekly allowance drawn down by every share-sheet send (Tickle
// Pics polaroids and entry shares alike). The age-tiered numbers and
// the weekly counter live in lib/freemiumCaps.js (feature
// 'polaroidExternalShare'); this file only calls into it.

import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';
import { recordPhotoShare } from './pinBoardDb';
import { NATURE_LABELS } from './theme';
import { weeklyCapStatus, checkAndConsumeWeeklyCap } from './freemiumCaps';

const SHARE_FEATURE = 'polaroidExternalShare';

// tickle_shares.caption has a DB check constraint limited to the two
// SHARE_CAPTIONS ids below (see migration 0001) -- a photo-only share
// (see sharePhotoOnlyEntry) still needs one of them for that insert +
// shareEntry's own dialogTitle lookup, even though the caption actually
// baked into the shared image is the entry's own Vibe label instead,
// fully decoupled from this id.
const PHOTO_ONLY_SHARE_CAPTION_ID = 'made_me_smile';

export const SHARE_CAPTIONS = [
  { id: 'made_me_smile', label: 'This made me smile today' },
  { id: 'thought_of_you', label: 'I saw this and thought of you' },
];

// This week's share allowance -- async now, the counter lives in
// feature_usage rather than on the already-loaded profile.
export function shareStatus(profile, now = new Date()) {
  return weeklyCapStatus(profile, SHARE_FEATURE, now);
}

// shareStatus for a screen's ShareModal `blocked` prop. Re-fetched each
// time `active` turns true (i.e. every time the modal opens), so a
// share made a moment ago is always reflected. null while loading or on
// failure -- the modal then just shows its normal picker, and
// shareEntry/sharePhoto's own check below still refuses an over-cap
// share (the caller shows alertCapBlocked for that result).
export function useShareStatus(profile, active) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!active || !profile) return;
    let cancelled = false;
    setStatus(null);
    shareStatus(profile)
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch((err) => console.error('useShareStatus failed', err));
    return () => { cancelled = true; };
  }, [active, profile]);

  return status;
}

// Records the share (weekly cap bookkeeping + a tickle_shares row) and
// opens the native share sheet. Returns { blocked: true, feature, cap } instead of
// sharing if the soft cap has already been reached — callers should show
// a message rather than sharing anyway.
//
// cardImageUri is an optional pre-generated share-card image (see
// lib/useShareCard.js) for entries with a linked Pin Board photo — when
// present it goes out via expo-sharing (file-only, no message param),
// otherwise this falls back to RN's Share with the caption + entry text
// exactly as before. The caller decides which applies; this function
// only dispatches on what it's given.
export async function shareEntry({ profile, entry, captionId, cardImageUri, logCaptionShare }) {
  const now = new Date();
  const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);

  const capResult = await checkAndConsumeWeeklyCap(profile, SHARE_FEATURE, now);
  if (capResult.blocked) return capResult;

  await supabase.from('tickle_shares').insert({
    entry_id: entry.id,
    created_by: profile.id,
    caption: captionId,
  });

  if (cardImageUri) {
    await Sharing.shareAsync(cardImageUri, { mimeType: 'image/jpeg', dialogTitle: caption.label });
  } else {
    await Share.share({
      message: `${caption.label}\n\n${entry.text_content}\n\n— via the DayTickles app`,
    });
  }

  // Caption-tagged echo for Home's two caption stat pills -- see
  // supabase/migrations/0064. Same insert sharePhoto() does below for
  // Pin Board photos; here it's a photo-attached text entry's own
  // polaroid card instead. Gated on cardImageUri (a real polaroid card
  // was actually built and sent, not the text-only fallback above) and
  // on the logCaptionShare opt-in -- sharePhotoOnlyEntry deliberately
  // never passes it, since its caption is hardcoded/unreliable, not a
  // real pick between the two SHARE_CAPTIONS.
  if (cardImageUri && logCaptionShare) {
    await supabase.from('polaroid_share_events').insert({ user_id: profile.id, caption: captionId });
  }

  return { blocked: false };
}

// Shared by every screen with a photo-only Tickle's own Share button
// (Home, Tickle Stash's Mine tab, Calendar) -- pulled out here once
// this needed to live in 2-3 places, rather than letting each screen's
// copy drift, the same discipline this project's already been burned by
// elsewhere (see project memory on near-duplicated per-screen logic).
// Skips ShareModal's two-caption picker entirely for these entries (the
// polaroid is already a complete, captioned object, so offering the
// same "made me smile / thought of you" wording choice built for text
// entries would just be a second, redundant caption) and bakes the
// entry's own NATURE_LABELS text into the generated ShareCard image
// instead, matching what the in-app Polaroid already shows (see
// EntryCard.js's polaroidCaptionStrip).
//
// captureCard is the caller's own useShareCard() hook function -- it
// has to stay call-site-local (it drives a real mounted/rendered
// ShareCard via a ref), so this only centralizes the *decision* logic
// (blocked / missing photo / capture failure) and the final shareEntry
// dispatch, not the actual card rendering. Pre-checks shareStatus
// before ever calling captureCard, so a blocked share doesn't waste
// time generating an image that's discarded — shareEntry below still
// re-checks/consumes the cap itself right before the real send, same as
// every other share path; the gap between these two checks is the same
// accepted risk tolerance ShareModal's own pre-computed `blocked` prop
// already carries elsewhere.
//
// Returns a status object for the caller to react to (no Alert calls in
// here — this file stays UI-agnostic, same as shareEntry/sharePhoto
// above): { missingPhoto: true } | { blocked: true, feature, cap } |
// { captureFailed: true } | the underlying shareEntry result on success.
export async function sharePhotoOnlyEntry({ profile, entry, photoUri, captureCard, accentColor }) {
  if (!photoUri) return { blocked: false, missingPhoto: true };

  const status = await shareStatus(profile);
  if (!status.unlimited && status.remaining <= 0) {
    return { blocked: true, feature: SHARE_FEATURE, cap: status.cap };
  }

  let cardImageUri;
  try {
    cardImageUri = await captureCard({
      photo: { file_path: photoUri },
      captionLabel: NATURE_LABELS[entry.tickle_nature],
      accentColor,
    });
  } catch (err) {
    console.error('sharePhotoOnlyEntry: card capture failed', err);
    return { blocked: false, captureFailed: true };
  }

  return shareEntry({
    profile,
    entry,
    captionId: PHOTO_ONLY_SHARE_CAPTION_ID,
    cardImageUri,
  });
}

// Photo-only share — triggered directly from a Pin Board photo (see
// PolaroidCard's Share button), with no tickle_entries row involved at
// all. Same weekly cap gate as shareEntry (same
// underlying resource, just a different entry point), but deliberately
// skips the tickle_shares insert: that table exists to drive the
// unlisted preview link (daytickles.app/t/<token>), which renders an
// entry's text/mood — there's no entry here to preview, and the photo
// file itself lives only in this device's local SQLite storage (see
// lib/pinBoardDb.js), never synced to Supabase, so there's nothing
// cloud-side a share row could even reference. The share event itself
// (which caption, when) is still recorded, just locally alongside the
// photo it belongs to — see recordPhotoShare in lib/pinBoardDb.js — so
// Weekly Summary's "thought of you" count doesn't silently miss
// photo-only shares the way it would if nothing were recorded at all.
//
// photoId + cardImageUri are both required, not optional — unlike
// shareEntry there's no text-message fallback available here (no entry
// text exists to fall back to), so the caller is expected to have
// already generated cardImageUri (or to not call this at all if
// generation failed).
export async function sharePhoto({ profile, photoId, captionId, cardImageUri }) {
  const now = new Date();
  const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);

  const capResult = await checkAndConsumeWeeklyCap(profile, SHARE_FEATURE, now);
  if (capResult.blocked) return capResult;

  await recordPhotoShare(profile.id, photoId, captionId);

  // Durable server-side echo of the share event (Founding Member's
  // "Photos shared" requirement gates a lifetime reward, so it can't
  // rely solely on the local-only pinboard DB above -- see
  // supabase/migrations/0022). Deliberately thin: no photo_id/caption,
  // just "this user shared a photo at this time."
  await supabase.from('photo_share_events').insert({ user_id: profile.id });

  // Caption-tagged echo for Home's two caption stat pills -- see
  // supabase/migrations/0064. Separate from photo_share_events above
  // (that one deliberately never records caption).
  await supabase.from('polaroid_share_events').insert({ user_id: profile.id, caption: captionId });

  await Sharing.shareAsync(cardImageUri, { mimeType: 'image/jpeg', dialogTitle: caption.label });

  return { blocked: false };
}
