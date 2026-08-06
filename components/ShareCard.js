// components/ShareCard.js
//
// Polaroid-echo layout for the generated share image: photo + caption
// baked into a single file via react-native-view-shot (see
// lib/useShareCard.js), so a Pin Board photo can go out through
// expo-sharing with its caption still attached — expo-sharing itself is
// file-only and can't carry text alongside a URI. Deliberately drops
// PolaroidCard's tilt and delete/save buttons: those exist for photos
// sitting loose on a board, not for a single image standing alone in
// someone's chat thread. Caption-only by design — never auto-includes
// entry.text_content, since the caption is a deliberately chosen phrase
// and the entry text might carry context never meant for that recipient.

import { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, darken } from '../lib/theme';

const CARD_WIDTH = 320;
const PHOTO_SIZE = CARD_WIDTH - 40; // 20px border on each side, polaroid-style

const ShareCard = forwardRef(function ShareCard({ photo, captionLabel, accentColor, onImageLoad, onImageError }, ref) {
  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      <View style={styles.pinBadge}>
        <Ionicons name="pin" size={14} color={C.rust} />
      </View>

      <View style={styles.photoShadowWrap}>
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: photo.file_path }}
            style={styles.photo}
            resizeMode="cover"
            onLoad={onImageLoad}
            onError={onImageError}
          />
        </View>
      </View>

      <Text style={styles.caption}>{captionLabel}</Text>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <View style={[styles.dividerDot, { backgroundColor: darken(accentColor, 0.25) }]} />
        <View style={styles.dividerLine} />
      </View>

      <Text style={styles.wordmark}>DayTickles</Text>
    </View>
  );
});

export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: C.card,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    alignItems: 'center',
  },
  pinBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  // Shadow lives on this outer wrapper, not photoWrap itself — a view
  // with overflow:'hidden' (needed below, for the rounded-corner clip)
  // clips its own shadow away along with everything else, same reason
  // PolaroidCard puts its shadow on the whole card rather than the photo.
  photoShadowWrap: {
    borderRadius: 6,
    backgroundColor: C.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  photoWrap: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.border,
  },
  photo: { width: '100%', height: '100%' },
  caption: {
    fontSize: 18,
    fontWeight: '700',
    color: C.rustDark,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 18,
    paddingHorizontal: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
    gap: 8,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerDot: { width: 6, height: 6, borderRadius: 3 },
  wordmark: {
    fontSize: 12,
    fontWeight: '600',
    color: C.subtext,
    letterSpacing: 1,
    marginTop: 12,
  },
});
