import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../lib/theme';
import Button from '../components/Button';
import PolaroidCard from '../components/PolaroidCard';
import PhotoEnlargeModal from '../components/PhotoEnlargeModal';
import AddPhotoActionSheet from '../components/AddPhotoActionSheet';
import {
  initPinBoardDb, listPinnedPhotos, addPinnedPhoto, deletePinnedPhoto, getLinkedPhotoIds,
} from '../lib/pinBoardDb';
import {
  pickFromCamera, pickFromLibrary, deletePinBoardPhotoFile, saveToDeviceLibrary,
} from '../lib/pinBoardPhotos';
import { hasSeenPinBoardNote, markPinBoardNoteSeen } from '../lib/pinBoardNote';

export default function PinBoard() {
  const { session } = useAuth();
  const [photos, setPhotos] = useState([]);
  const [tickledIds, setTickledIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [enlargeUri, setEnlargeUri] = useState(null);
  const [showNote, setShowNote] = useState(false);
  const [status, setStatus] = useState('');
  const [showAddPhoto, setShowAddPhoto] = useState(false);

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

  // DB row first — if this fails, nothing's happened yet and the photo
  // is still intact. File delete second (a safe no-op if already gone),
  // resolving the orphaned-file gap flagged in lib/pinBoardDb.js.
  // pinned_photos' ON DELETE CASCADE handles any photo_entry_links rows.
  async function handleDeletePhoto(photo) {
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Pin Board</Text>
        <Text style={styles.subheading}>Day Journal Moments</Text>
        <Text style={styles.permanentCaptionBold}>
          Tap 'Tickle' on the photo to Journal about it. This will also link the moment to your
          journal entry.
        </Text>
        <Text style={styles.permanentCaption}>
          Photos and their tickle-links live only on this device — they won't appear on a
          different phone or after a reinstall.
        </Text>

        {showNote && (
          <TouchableOpacity style={styles.noteBanner} activeOpacity={0.85} onPress={handleDismissNote}>
            <Text style={styles.noteBannerText}>
              Your Pin Board is stored only on this phone's private app storage — nothing here is
              backed up or synced. If you lose or replace this device, or uninstall the app,
              photos taken through the app will be lost. Photos chosen from your library will
              still be on your phone — only the copy on your Pin Board is gone. Want to protect a
              specific photo? Tap the download icon on any pinned photo to save a copy to your
              phone's regular Photos app.
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
              onDelete={handleDeletePhoto}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  subheading: { fontSize: 15, fontWeight: '600', color: C.rustDark, marginTop: 4 },
  permanentCaptionBold: { fontSize: 12, fontWeight: '700', color: C.subtext, marginTop: 8 },
  permanentCaption: { fontSize: 12, color: C.subtext, marginTop: 4, marginBottom: 16 },
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
