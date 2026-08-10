// components/TiledWallpaper.js
//
// Full-screen repeating background. Deliberately NOT using Image's
// resizeMode="repeat" (unreliable on physical Android devices) or an
// SVG <Pattern> (known cross-platform tiling quirks) -- instead lays
// out a plain flex-wrap grid of same-size Image tiles sized to cover
// the window, which sidesteps both native-repeat code paths entirely.
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';

const TILE_SIZE = 120;
const OPACITY = 0.15;
const TILE_SOURCE = require('../assets/backgrounds/tickle_wallpaper_tile.png');

export default function TiledWallpaper() {
  const { width, height } = useWindowDimensions();
  const cols = Math.ceil(width / TILE_SIZE);
  const rows = Math.ceil(height / TILE_SIZE);
  const tiles = cols * rows;

  return (
    <View style={[styles.container, { width, height, opacity: OPACITY }]} pointerEvents="none">
      <View style={[styles.grid, { width: cols * TILE_SIZE }]}>
        {Array.from({ length: tiles }).map((_, i) => (
          <Image key={i} source={TILE_SOURCE} style={styles.tile} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: TILE_SIZE, height: TILE_SIZE },
});
