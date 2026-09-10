import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, darken, lighten, NATURE_ORDER, vibeIconColor } from '../lib/theme';
import NatureIcon from './NatureIcon';

function formatPinnedDate(pinnedAt) {
  return new Date(pinnedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
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
//
// onVibeTap(photo, vibeId) creates a new photo-only Tickle straight from
// this card, skipping the New Tickle screen entirely -- see
// pinboard.js's handlePhotoVibeTap. Independent of onTickle, which still
// pins this same photo to a separately-written entry; a photo can go
// through both paths. The same handler also creates a photo-only My Day
// entry when the sun icon below passes 'day_journal' instead of a real
// Vibe id -- createPhotoOnlyTickle never validated its nature param
// against the three Vibes specifically, so no change was needed there.
//
// profile is only read for day_journal_enabled (gates the sun icon,
// same condition create.js/feed.js already use for My Day's text entry
// point) -- not threaded any further than that.
export default function PolaroidCard({ photo, tickled, profile, onPress, onTickle, onVibeTap, onShare, onRequestDelete, onSaveToLibrary }) {
  const [saved, setSaved] = useState(false);

  async function handleSavePress() {
    const success = await onSaveToLibrary?.(photo);
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
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

      <View style={styles.photoWrap}>
        <TouchableOpacity
          onPress={() => onRequestDelete?.(photo)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={12} color={C.rust} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSavePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.downloadButton}
        >
          <Ionicons name={saved ? 'checkmark' : 'download-outline'} size={12} color={C.rust} />
        </TouchableOpacity>

        <Image source={{ uri: photo.file_path }} style={styles.photo} />

        <View style={styles.vibeRow}>
          {NATURE_ORDER.map((nature) => (
            <TouchableOpacity
              key={nature}
              onPress={() => onVibeTap?.(photo, nature)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={styles.vibeButton}
            >
              {/* vibeIconColor, not the raw VIBE_COLORS value -- at this
                  small a size on this near-white circle, the raw amber/
                  teal vibes measured well under WCAG's 3:1 minimum for
                  graphical objects (see lib/theme.js's own comment). */}
              <NatureIcon nature={nature} size={11} color={vibeIconColor(nature)} />
            </TouchableOpacity>
          ))}
          {/* My Day has no VIBE_COLORS/NATURE_ORDER entry of its own
              (deliberately excluded there -- it's not a Vibe) so this
              reuses C.rust instead, matching every other icon already on
              this card's photo (pin/trash/download/share) rather than
              introducing a new color for one glyph. */}
          {!!profile?.day_journal_enabled && (
            <TouchableOpacity
              onPress={() => onVibeTap?.(photo, 'day_journal')}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={styles.vibeButton}
            >
              <Ionicons name="sunny-outline" size={12} color={C.rust} />
            </TouchableOpacity>
          )}
        </View>

        {/* Relocated again, this time to the top-center gap between
            deleteButton and downloadButton -- freed up vibeRow's bottom-
            left footprint for the full 4-icon row (3 Vibes + My Day's
            sun) at a comfortable gap, rather than narrowing that row to
            make room for this badge instead. See tickledBadge's own
            style comment for the exact math. */}
        {tickled && (
          <View style={styles.tickledBadge}>
            <Ionicons name="checkmark" size={9} color={darken(C.teal, 0.4)} />
          </View>
        )}
      </View>

      <View style={styles.captionStrip}>
        <Text style={styles.captionDate}>{formatPinnedDate(photo.pinned_at)}</Text>
        <View style={styles.captionActions}>
          <TouchableOpacity
            onPress={onTickle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.tickleButton}
          >
            <Text style={styles.tickleButtonText}>Tickle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.shareIconButton}
          >
            <Ionicons name="share-outline" size={12} color={C.rust} />
          </TouchableOpacity>
        </View>
      </View>
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
  // Tightly wraps just the photo (no card padding inside it) so the
  // corner-icon overlays below anchor to the photo's own edges — bottom:
  // positioning in particular would otherwise land inside captionStrip.
  photoWrap: { position: 'relative' },
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
  // Mirrors deleteButton's top-left position -- Download moved here from
  // bottom-left to free that corner for vibeRow below.
  downloadButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  // Three vibe icons plus (conditionally) the My Day sun icon, packed
  // into the same bottom-left footprint the single Download button used
  // to occupy -- tapping one instantly creates a photo-only Tickle (see
  // onVibeTap).
  vibeRow: {
    position: 'absolute',
    bottom: 10,
    // Full-width (left:8/right:8) + space-between instead of a left-
    // anchored gap:9 row -- with tickledBadge relocated off this corner,
    // the 4 icons (3 Vibes + My Day) now spread proportionally across
    // the whole photo width rather than clustering against the left
    // edge, matching the corner icons' own left/right symmetry above.
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  vibeButton: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Moved again -- was bottom-right, sharing the vibeRow corner it now
  // needs entirely to itself for the 4-icon row (3 Vibes + My Day's sun).
  // Top-center is the one genuinely free spot left on the photo: it sits
  // in the same top:12 row as deleteButton/downloadButton, in the ~74px
  // gap between them (deleteButton ends at x=30, downloadButton starts
  // at x=104, on a 134px-wide photoWrap) -- centered the same way
  // pinIconWrap centers itself (left:50%, negative marginLeft of half
  // the width), well clear of pinIconWrap itself (that only bleeds ~4px
  // into the photo's very top, nowhere near y=12).
  tickledBadge: {
    position: 'absolute',
    top: 12,
    left: '50%',
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
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
  captionActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tickleButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: C.sparkleBg,
  },
  tickleButtonText: { fontSize: 11, fontWeight: '600', color: C.sparkleText },
  // Icon-only, not a text pill like Tickle — a third full-text label
  // doesn't fit this card's ~130px row (see width estimate that led
  // here); size/shape matches the delete/save corner icons on the photo
  // above, but C.bg instead of their white-on-photo rgba fill, same
  // light-circle-on-white-card treatment ShareCard's own pin badge uses
  // for the same reason (a white circle on the white card would vanish).
  shareIconButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
