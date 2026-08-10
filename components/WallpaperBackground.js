// components/WallpaperBackground.js
//
// Per-screen opaque wrapper: paints the cream base + tiled wallpaper
// inside each screen's own view tree, instead of relying on one shared
// layer behind a transparent Stack/Tabs. Keeps every screen genuinely
// opaque again (as the rest of the app already assumes for slide
// transitions to look clean) while still showing the wallpaper.
import { View, StyleSheet } from 'react-native';
import { C } from '../lib/theme';
import TiledWallpaper from './TiledWallpaper';

export default function WallpaperBackground({ children }) {
  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} pointerEvents="none" />
      <TiledWallpaper />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
