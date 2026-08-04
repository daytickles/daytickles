import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { C } from '../lib/theme';
import Button from '../components/Button';
import PolaroidCard from '../components/PolaroidCard';
import PhotoEnlargeModal from '../components/PhotoEnlargeModal';
import { initPinBoardDb, listPinnedPhotos, addPinnedPhoto, getLinkedPhotoIds } from '../lib/pinBoardDb';
import { pickFromCamera, pickFromLibrary } from '../lib/pinBoardPhotos';
import { hasSeenPinBoardNote, markPinBoardNoteSeen } from '../lib/pinBoardNote';

export default function PinBoard() {
  const [photos, setPhotos] = useState([]);
  const [tickledIds, setTickledIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [enlargeUri, setEnlargeUri] = useState(null);
  const [showNote, setShowNote] = useState(false);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    await initPinBoardDb();
    const [rows, linkedPhotoIds] = await Promise.all([listPinnedPhotos(), getLinkedPhotoIds()]);
    setPhotos(rows);
    setTickledIds(new Set(linkedPhotoIds));
    setLoading(false);
  }, []);

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
      (async () => {
        if (!(await hasSeenPinBoardNote())) setShowNote(true);
      })();
    }, [])
  );

  async function handleDismissNote() {
    setShowNote(false);
    await markPinBoardNoteSeen();
  }

  async function handleTakePhoto() {
    setAdding(true);
    const result = await pickFromCamera();
    if (!result.canceled) {
      await addPinnedPhoto(result.uri);
      await loadBoard();
    }
    setAdding(false);
  }

  async function handleChooseFromLibrary() {
    setAdding(true);
    const result = await pickFromLibrary();
    if (!result.canceled) {
      await addPinnedPhoto(result.uri);
      await loadBoard();
    }
    setAdding(false);
  }

  function handleAddPhoto() {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: handleTakePhoto },
      { text: 'Choose from Library', onPress: handleChooseFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
        <Text style={styles.permanentCaption}>
          Photos and their tickle-links live only on this device — they won't appear on a
          different phone or after a reinstall.
        </Text>

        {showNote && (
          <TouchableOpacity style={styles.noteBanner} activeOpacity={0.85} onPress={handleDismissNote}>
            <Text style={styles.noteBannerText}>
              Your Pin Board is stored only on this phone. Nothing here is backed up or synced —
              if you lose or replace this device, or uninstall the app, these photos are gone for
              good.
            </Text>
            <Ionicons name="close" size={16} color={C.sparkleText} style={styles.noteBannerClose} />
          </TouchableOpacity>
        )}

        <Button
          title={adding ? 'Adding...' : '+ Add Photo'}
          onPress={handleAddPhoto}
          disabled={adding}
          variant="primary"
        />

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
            />
          ))}
        </View>
      </ScrollView>

      <PhotoEnlargeModal uri={enlargeUri} onDismiss={() => setEnlargeUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark },
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
  loader: { marginTop: 24 },
  empty: { color: C.subtext, fontStyle: 'italic', paddingVertical: 10, textAlign: 'center', marginTop: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 20,
  },
});
