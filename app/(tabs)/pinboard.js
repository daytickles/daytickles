import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { C, accentFor } from '../../lib/theme';
import { sharePhoto, shareStatus, SHARE_CAPTIONS } from '../../lib/sharing';
import { localDateString } from '../../lib/week';
import Button from '../../components/Button';
import PolaroidCard from '../../components/PolaroidCard';
import PhotoEnlargeModal from '../../components/PhotoEnlargeModal';
import AddPhotoActionSheet from '../../components/AddPhotoActionSheet';
import ShareModal from '../../components/ShareModal';
import DeletePhotoModal from '../../components/DeletePhotoModal';
import PhotoTickleDisclosureModal from '../../components/PhotoTickleDisclosureModal';
import CornerNav from '../../components/CornerNav';
import {
  initPinBoardDb, listPinnedPhotos, addPinnedPhoto, deletePinnedPhoto, getLinkedPhotoIds,
  linkPhotoToEntry, getEntryIdsForPhoto,
} from '../../lib/pinBoardDb';
import {
  pickFromCamera, pickFromLibrary, deletePinBoardPhotoFile, saveToDeviceLibrary,
} from '../../lib/pinBoardPhotos';
import { hasSeenPinBoardNote, markPinBoardNoteSeen } from '../../lib/pinBoardNote';
import { hasSeenPhotoTickleDisclosure, markPhotoTickleDisclosureSeen } from '../../lib/photoTickleDisclosure';
import { useShareCard } from '../../lib/useShareCard';
import WallpaperBackground from '../../components/WallpaperBackground';

export default function PinBoard() {
  const { session, profile, refreshProfile } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState([]);
  const [tickledIds, setTickledIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [enlargeUri, setEnlargeUri] = useState(null);
  const [showNote, setShowNote] = useState(false);
  const [status, setStatus] = useState('');
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [sharePhotoTarget, setSharePhotoTarget] = useState(null);
  const [deleteInfo, setDeleteInfo] = useState(null); // { photo, scenario, photoOnlyEntryIds }
  const [pendingVibeTap, setPendingVibeTap] = useState(null); // { photo, vibeId } while the first-use disclosure is up
  const [showDisclosure, setShowDisclosure] = useState(false);
  const { hiddenCard, captureCard } = useShareCard();

  const loadBoard = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    await initPinBoardDb(session.user.id);
    const [rows, linkedPhotoIds] = await Promise.all([
      listPinnedPhotos(session.user.id),
      getLinkedPhotoIds(session.user.id),
    ]);
    setPhotos(rows);
    setTickledIds(new Set(linkedPhotoIds));
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadBoard();
    }, [loadBoard])
  );

  // Auto-shown-once, same shape as home_guide_seen's check-on-mount —
  // but backed by AsyncStorage (see lib/pinBoardNote.js) since this
  // flag, like the photos themselves, must stay device-local.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      (async () => {
        if (!(await hasSeenPinBoardNote(session.user.id))) setShowNote(true);
      })();
    }, [session])
  );

  async function handleDismissNote() {
    setShowNote(false);
    await markPinBoardNoteSeen(session.user.id);
  }

  async function handleTakePhoto() {
    setShowAddPhoto(false);
    setAdding(true);
    setStatus('');
    const result = await pickFromCamera(session.user.id);
    if (result.error) {
      setStatus(result.error);
    } else if (!result.canceled) {
      await addPinnedPhoto(session.user.id, result.uri);
      await loadBoard();
    }
    setAdding(false);
  }

  async function handleChooseFromLibrary() {
    setShowAddPhoto(false);
    setAdding(true);
    setStatus('');
    const result = await pickFromLibrary(session.user.id);
    if (result.error) {
      setStatus(result.error);
    } else if (!result.canceled) {
      await addPinnedPhoto(session.user.id, result.uri);
      await loadBoard();
    }
    setAdding(false);
  }

  // Looks up what deleting this photo would actually do before showing
  // any confirmation -- a photo can be linked to a photo-only Tickle it
  // created (its own entry_kind='photo_only' entry), a separate
  // written Tickle it's pinned to via the Tickle button, both at once,
  // or (the pre-existing case) neither. deleteInfo.photoOnlyEntryIds
  // drives what handleConfirmDelete deletes alongside the photo itself.
  async function handleRequestDelete(photo) {
    const entryIds = await getEntryIdsForPhoto(session.user.id, photo.id);
    let scenario = 'plain';
    let photoOnlyEntryIds = [];

    if (entryIds.length) {
      const { data, error } = await supabase
        .from('tickle_entries')
        .select('id, entry_kind')
        .in('id', entryIds);

      if (!error && data) {
        photoOnlyEntryIds = data.filter((e) => e.entry_kind === 'photo_only').map((e) => e.id);
        const hasTextLink = data.some((e) => e.entry_kind === 'text');
        if (photoOnlyEntryIds.length && hasTextLink) scenario = 'both';
        else if (photoOnlyEntryIds.length) scenario = 'sole';
        else if (hasTextLink) scenario = 'pinned';
      }
    }

    setDeleteInfo({ photo, scenario, photoOnlyEntryIds });
  }

  function handleCancelDelete() {
    setDeleteInfo(null);
  }

  // Cloud entry delete first (only present for 'sole'/'both' scenarios)
  // -- if this fails, nothing else has happened yet and the photo/entry
  // are both still intact. DB row second, file delete last (a safe
  // no-op if already gone), same ordering the pre-existing delete flow
  // always used, resolving the orphaned-file gap flagged in
  // lib/pinBoardDb.js. pinned_photos' ON DELETE CASCADE handles any
  // photo_entry_links rows, cloud or otherwise.
  async function handleConfirmDelete() {
    if (!deleteInfo) return;
    const { photo, photoOnlyEntryIds } = deleteInfo;
    setDeleteInfo(null);

    if (photoOnlyEntryIds.length) {
      const { error } = await supabase.from('tickle_entries').delete().in('id', photoOnlyEntryIds);
      if (error) {
        setStatus('Could not delete that Tickle — please try again.');
        return;
      }
    }

    await deletePinnedPhoto(session.user.id, photo.id);
    deletePinBoardPhotoFile(session.user.id, photo.file_path);
    await loadBoard();
  }

  // Returns success/failure so PolaroidCard knows whether to show its own
  // brief checkmark — errors (permission denied, save failed) surface via
  // the screen's existing status line instead of a new UI element.
  async function handleSaveToLibrary(photo) {
    const result = await saveToDeviceLibrary(photo.file_path);
    if (result.error) setStatus(result.error);
    return !result.error;
  }

  function handleAddPhoto() {
    setShowAddPhoto(true);
  }

  function handleTickle(photo) {
    router.push({ pathname: '/create', params: { pinnedPhotoId: String(photo.id) } });
  }

  // Gate: the very first time anyone taps a Vibe icon, the disclosure
  // modal interrupts the otherwise-instant creation flow once; every
  // tap after that goes straight through. See createPhotoOnlyTickle for
  // what "goes straight through" actually does.
  async function handlePhotoVibeTap(photo, vibeId) {
    if (!(await hasSeenPhotoTickleDisclosure(session.user.id))) {
      setPendingVibeTap({ photo, vibeId });
      setShowDisclosure(true);
      return;
    }
    await createPhotoOnlyTickle(photo, vibeId);
  }

  async function handleDisclosureDismiss() {
    setShowDisclosure(false);
    await markPhotoTickleDisclosureSeen(session.user.id);
    if (pendingVibeTap) {
      const { photo, vibeId } = pendingVibeTap;
      setPendingVibeTap(null);
      await createPhotoOnlyTickle(photo, vibeId);
    }
  }

  // Creates the cloud entry, links it to the already-pinned photo via
  // the same photo_entry_links mechanism the Tickle button already uses
  // (linkPhotoToEntry), then auto-saves a copy to the device gallery --
  // every photo-only Tickle gets the same backup the manual Download
  // icon has always offered, without requiring a separate tap.
  // saveToDeviceLibrary's own permission request is what the first-use
  // disclosure modal is really unblocking; a permission grant here is a
  // no-op on every call after the first.
  async function createPhotoOnlyTickle(photo, vibeId) {
    const filename = photo.file_path.split('/').pop();
    const { data, error } = await supabase
      .from('tickle_entries')
      .insert({
        user_id: session.user.id,
        entry_date: localDateString(),
        text_content: null,
        tickle_nature: vibeId,
        entry_kind: 'photo_only',
        local_photo_filename: filename,
        visibility: 'private',
      })
      .select('id')
      .single();

    if (error || !data) {
      setStatus('Could not create that Tickle — please try again.');
      return;
    }

    await linkPhotoToEntry(session.user.id, photo.id, data.id);
    setTickledIds((prev) => new Set(prev).add(photo.id));

    const saveResult = await saveToDeviceLibrary(photo.file_path);
    if (saveResult.error) setStatus(saveResult.error);
  }

  async function handleSharePhoto(photo, captionId) {
    setSharePhotoTarget(null);
    const caption = SHARE_CAPTIONS.find((c) => c.id === captionId);

    let cardImageUri;
    try {
      cardImageUri = await captureCard({
        photo,
        captionLabel: caption.label,
        accentColor: accentFor(profile?.accent_theme).card,
      });
    } catch (err) {
      // No text-based fallback exists for a photo-only share (unlike
      // shareEntry, which can always fall back to a plain-text message)
      // — if the card can't be generated, this fails visibly rather than
      // silently sending some other, caption-less image than what
      // tapping Share implied.
      console.error('handleSharePhoto: card capture failed', err);
      setStatus('Could not prepare that photo to share — please try again.');
      return;
    }

    await sharePhoto({ profile, photoId: photo.id, captionId, onProfileUpdated: refreshProfile, cardImageUri });
  }

  const shareStat = profile ? shareStatus(profile) : null;
  const shareBlocked = !!shareStat && !shareStat.unlimited && shareStat.remaining <= 0;

  return (
    <WallpaperBackground>
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: styles.content.paddingBottom + tabBarHeight },
        ]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>Tickle Pics</Text>
          <CornerNav style={styles.cornerNavInline} />
        </View>
        <Text style={styles.subheading}>Share it, Save it, Tickle it</Text>
        <Text style={styles.permanentCaptionBold}>
          Photos are stored only on this device. Tap Tickle to write about one,{' '}
          <Ionicons name="share-outline" size={13} color={C.subtext} /> to share it, or the{' '}
          <Ionicons name="download-outline" size={13} color={C.subtext} /> to save a copy to your Photos app.
        </Text>

        {showNote && (
          <TouchableOpacity style={styles.noteBanner} activeOpacity={0.85} onPress={handleDismissNote}>
            <Text style={styles.noteBannerText}>
              Your Tickle Pics are stored only within this app on your device. They aren't backed
              up or synced anywhere. If you uninstall the app, replace your device, or lose it,
              any photos taken with the app will be lost unless you've saved them first.
              {'\n\n'}
              Photos you've added from your phone's library will remain safely in your Photos app
              — only the copy stored in DayTickles will be removed.
              {'\n\n'}
              Want to keep a Tickle Pic? Simply tap the{' '}
              <Ionicons name="download-outline" size={14} color={C.sparkleText} /> to save it to your phone's
              Photos app.
              {'\n\n'}
              When you share a Tickle Pic, it's sent directly from your device to the person or
              app you choose. It's never uploaded to our servers.
            </Text>
            <Ionicons name="close" size={16} color={C.sparkleText} style={styles.noteBannerClose} />
          </TouchableOpacity>
        )}

        <Button
          title={adding ? 'Adding...' : '+ Add Photo'}
          onPress={handleAddPhoto}
          disabled={adding}
          variant="secondary"
        />
        {!!status && <Text style={styles.status}>{status}</Text>}

        {loading && <ActivityIndicator color={C.rust} style={styles.loader} />}

        {!loading && photos.length === 0 && (
          <Text style={styles.empty}>No pinned photos yet — add one above.</Text>
        )}

        <View style={styles.grid}>
          {photos.map((photo) => (
            <PolaroidCard
              key={photo.id}
              photo={photo}
              tickled={tickledIds.has(photo.id)}
              onPress={() => setEnlargeUri(photo.file_path)}
              onTickle={() => handleTickle(photo)}
              onVibeTap={handlePhotoVibeTap}
              onShare={() => setSharePhotoTarget(photo)}
              onRequestDelete={handleRequestDelete}
              onSaveToLibrary={handleSaveToLibrary}
            />
          ))}
        </View>
      </ScrollView>

      <PhotoEnlargeModal uri={enlargeUri} onDismiss={() => setEnlargeUri(null)} />

      <AddPhotoActionSheet
        visible={showAddPhoto}
        onTakePhoto={handleTakePhoto}
        onChooseFromLibrary={handleChooseFromLibrary}
        onDismiss={() => setShowAddPhoto(false)}
      />

      <ShareModal
        visible={sharePhotoTarget}
        captions={SHARE_CAPTIONS}
        blocked={shareBlocked}
        cap={shareStat?.cap}
        onConfirm={(captionId) => handleSharePhoto(sharePhotoTarget, captionId)}
        onDismiss={() => setSharePhotoTarget(null)}
      />

      <DeletePhotoModal
        visible={!!deleteInfo}
        scenario={deleteInfo?.scenario}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <PhotoTickleDisclosureModal visible={showDisclosure} onDismiss={handleDisclosureDismiss} />

      {hiddenCard}
    </View>
    </WallpaperBackground>
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
  subheading: { fontSize: 15, fontWeight: '600', color: C.rustDark, marginTop: 4 },
  permanentCaptionBold: { fontSize: 12, fontWeight: '700', color: C.subtext, marginTop: 8, marginBottom: 16 },
  noteBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.sparkleBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  noteBannerText: { flex: 1, fontSize: 13, color: C.sparkleText, lineHeight: 18 },
  noteBannerClose: { marginLeft: 10, marginTop: 2 },
  status: { marginTop: 12, color: C.rust, textAlign: 'center' },
  loader: { marginTop: 24 },
  empty: { color: C.subtext, fontStyle: 'italic', paddingVertical: 10, textAlign: 'center', marginTop: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 20,
  },
});
