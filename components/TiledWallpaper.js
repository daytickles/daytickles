// components/TiledWallpaper.js
//
// Full-screen repeating background. Deliberately NOT using Image's
// resizeMode="repeat" (unreliable on physical Android devices) or an
// SVG <Pattern> (known cross-platform tiling quirks) -- instead lays
// out a plain flex-wrap grid of same-size Image tiles sized to cover
// the window, which sidesteps both native-repeat code paths entirely.
//
// Sized via onLayout, not useWindowDimensions() -- confirmed by a
// debug-color test (bug-2 investigation) that this hook can under-
// report the true screen height on some Android configs (it's backed
// by "window" dimensions, which can exclude system-bar insets, while
// the actual native view hierarchy -- and this app's floating/
// absolute tab bar -- still renders edge-to-edge to the real screen).
// onLayout reports the container's actual measured size after it's
// really been laid out, so cols/rows always match reality regardless
// of which dimensions API is right on a given device.
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

const TILE_SIZE = 120;
const OPACITY = 0.15;
const TILE_SOURCE = require('../assets/backgrounds/tickle_wallpaper_tile.png');

export default function TiledWallpaper() {
  const [size, setSize] = useState(null);

  return (
    <View
      style={[styles.container, { opacity: OPACITY }]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
      }}
    >
      {size && (() => {
        const cols = Math.ceil(size.width / TILE_SIZE);
        const rows = Math.ceil(size.height / TILE_SIZE);
        const tiles = cols * rows;
        return (
          <View style={[styles.grid, { width: cols * TILE_SIZE }]}>
            {Array.from({ length: tiles }).map((_, i) => (
              <Image key={i} source={TILE_SOURCE} style={styles.tile} />
            ))}
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: TILE_SIZE, height: TILE_SIZE },
});
