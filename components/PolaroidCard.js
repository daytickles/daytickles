import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, darken, lighten } from '../lib/theme';
import DeletePhotoModal from './DeletePhotoModal';

function formatPinnedDate(pinnedAt) {
  return new Date(pinnedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Deterministic per-photo tilt, not random — a random value would
// re-roll (and visibly jitter) on every re-render. -3..3deg spread,
// keyed off the row id so neighboring cards don't line up identically.
function rotationFor(id) {
  return `${((id % 5) - 2) * 1.5}deg`;
}

// tickled and onTickle are fully independent of each other, per design:
// the button always works regardless of the badge's state, since one
// photo can link to many entries over time.
export default function PolaroidCard({ photo, tickled, onPress, onTickle, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleConfirmDelete() {
    setShowDeleteConfirm(false);
    onDelete?.(photo);
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.card, { transform: [{ rotate: rotationFor(photo.id) }] }]}
    >
      <View style={styles.pinIconWrap}>
        <Ionicons name="pin" size={14} color={C.rust} />
      </View>

      <TouchableOpacity
        onPress={() => setShowDeleteConfirm(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.deleteButton}
      >
        <Ionicons name="trash-outline" size={12} color={C.rust} />
      </TouchableOpacity>

      <Image source={{ uri: photo.file_path }} style={styles.photo} />

      {tickled && (
        <View style={styles.tickledBadge}>
          <Ionicons name="checkmark" size={10} color={darken(C.teal, 0.4)} />
        </View>
      )}

      <View style={styles.captionStrip}>
        <Text style={styles.captionDate}>{formatPinnedDate(photo.pinned_at)}</Text>
        <TouchableOpacity
          onPress={onTickle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.tickleButton}
        >
          <Text style={styles.tickleButtonText}>Tickle</Text>
        </TouchableOpacity>
      </View>

      <DeletePhotoModal
        visible={showDeleteConfirm}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 150,
    backgroundColor: C.card,
    borderRadius: 6,
    padding: 8,
    paddingBottom: 6,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  pinIconWrap: {
    position: 'absolute',
    top: -8,
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 2, backgroundColor: C.border },
  deleteButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tickledBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: lighten(C.teal, 0.6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  captionDate: { fontSize: 11, color: C.subtext },
  tickleButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: C.sparkleBg,
  },
  tickleButtonText: { fontSize: 11, fontWeight: '600', color: C.sparkleText },
});
