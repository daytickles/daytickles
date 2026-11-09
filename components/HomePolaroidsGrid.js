// components/HomePolaroidsGrid.js
//
// The rows of Home's Polaroids sent card, an ordinary scrolling deck card
// (HomeDeck gives it its vertical list, bottom fade and list padding):
// the newest sent Polaroids (lib/polaroidsSent.js) as small white-framed
// thumbnails, two across, newest first, left to right then down. The
// pair is centred in the card with GAP between the columns and the rows;
// an odd last one sits in the left column.
//
// Thumbnail width: min(MAX_THUMB_WIDTH, (body width - GAP) / 2). The pin,
// gaps, divider and dot scale with the width (the dot never below
// MIN_DOT_SIZE); the caption doesn't: CAPTION_FONT_SIZE always, up to 2
// lines. The frame's height is worked out from its parts (thumbHeight),
// so nothing is clipped and BOTTOM_SPACE of white stays under the
// divider. Each one: a pin at the top, the photo (the cached small JPEG,
// square), the caption, and a thin divider with the Polaroid's own
// accent-colour dot (as ShareCard draws it). No "DayTickles App" footer
// here; a tap opens the full Polaroid (PolaroidViewModal).
import { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, darken } from '../lib/theme';

// The design width the scaling parts are scaled from.
const BASE_WIDTH = 140;
const MAX_THUMB_WIDTH = 100;
const GAP = 12;
const CAPTION_FONT_SIZE = 8.5;
const CAPTION_LINE_HEIGHT = 10.5;
const CAPTION_LINES = 2;
const CAPTION_MAX_FONT_SCALE = 1.2;
const MIN_DOT_SIZE = 4;
const BOTTOM_SPACE = 6;

// Every size in a thumbnail of this width, at this font scale.
function thumbLayout(width, fontScale) {
  const s = width / BASE_WIDTH;
  const pad = 12 * s;
  const padTop = 6 * s;
  const pin = 14 * s;
  const pinGap = 3 * s;
  const photo = width - 2 * pad;
  const captionGap = 4 * s;
  // The caption's lines grow with the font size, up to its own cap.
  const captionHeight = CAPTION_LINES * CAPTION_LINE_HEIGHT * Math.min(Math.max(fontScale || 1, 1), CAPTION_MAX_FONT_SCALE);
  const dividerGap = 4 * s;
  const dot = Math.max(MIN_DOT_SIZE, 5 * s);
  const height = Math.ceil(padTop + pin + pinGap + photo + captionGap + captionHeight + dividerGap + dot + BOTTOM_SPACE);
  return { s, pad, padTop, pin, pinGap, photo, captionGap, captionHeight, dividerGap, dot, height };
}

function Thumbnail({ item, width, fontScale, accentColor, onPress }) {
  const t = thumbLayout(width, fontScale);
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(item)}
      style={[styles.frame, { width, height: t.height, paddingHorizontal: t.pad, paddingTop: t.padTop, borderRadius: 8 * t.s }]}
      accessibilityRole="button"
      accessibilityLabel={`Polaroid: ${item.captionLabel}. Opens it larger.`}
    >
      <View style={[styles.pin, { width: t.pin, height: t.pin, borderRadius: t.pin / 2, marginBottom: t.pinGap }]}>
        <Ionicons name="pin" size={9 * t.s} color={C.rust} />
      </View>
      <View style={[styles.photoWrap, { width: t.photo, height: t.photo, borderRadius: 3 * t.s }]}>
        <Image source={{ uri: item.thumbUri }} style={styles.photo} resizeMode="cover" resizeMethod="resize" />
      </View>
      <Text
        style={[styles.caption, { height: t.captionHeight, marginTop: t.captionGap }]}
        numberOfLines={CAPTION_LINES}
        maxFontSizeMultiplier={CAPTION_MAX_FONT_SCALE}
      >
        {item.captionLabel}
      </Text>
      <View style={[styles.dividerRow, { marginTop: t.dividerGap, gap: 5 * t.s }]}>
        <View style={styles.dividerLine} />
        <View
          style={{
            width: t.dot, height: t.dot, borderRadius: t.dot / 2,
            backgroundColor: darken(accentColor, 0.25),
          }}
        />
        <View style={styles.dividerLine} />
      </View>
    </TouchableOpacity>
  );
}

export default function HomePolaroidsGrid({ items, accentColor, onOpen }) {
  const { fontScale } = useWindowDimensions();
  // The list's measured width sets the thumbnail size; nothing is drawn
  // until it's known, so the thumbnails never jump in size.
  const [bodyWidth, setBodyWidth] = useState(0);
  const thumbWidth = bodyWidth > 0 ? Math.min(MAX_THUMB_WIDTH, Math.floor((bodyWidth - GAP) / 2)) : 0;

  return (
    <View onLayout={(e) => setBodyWidth(Math.floor(e.nativeEvent.layout.width))}>
      {thumbWidth > 0 && (
        <View style={[styles.grid, { width: 2 * thumbWidth + GAP }]}>
          {items.map((item) => (
            <Thumbnail
              key={item.id}
              item={item}
              width={thumbWidth}
              fontScale={fontScale}
              accentColor={accentColor}
              onPress={onOpen}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GAP,
    rowGap: GAP,
  },
  frame: {
    backgroundColor: C.card,
    alignItems: 'center',
    overflow: 'hidden',
  },
  pin: { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  photoWrap: { overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: C.border },
  photo: { width: '100%', height: '100%' },
  caption: {
    fontSize: CAPTION_FONT_SIZE,
    lineHeight: CAPTION_LINE_HEIGHT,
    fontWeight: '700',
    color: C.rustDark,
    textAlign: 'center',
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
});
