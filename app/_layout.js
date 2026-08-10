import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { AuthProvider } from '../contexts/AuthContext';
import { NotificationsProvider } from '../contexts/NotificationsContext';
import AppLockGate from '../components/AppLockGate';
import TiledWallpaper from '../components/TiledWallpaper';
import { C } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <AppLockGate>
          {/* Base layer: paints the cream background itself. Every
              screen's own opaque C.bg container used to be what did
              this; stripping that per-screen for the wallpaper trial
              also stripped the color, leaving plain (native) white
              underneath instead of cream. This restores it as one
              shared layer so removing a screen's own background
              reveals cream+wallpaper, not white. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} pointerEvents="none" />
          <TiledWallpaper />
          <Stack
            screenOptions={{
              headerShown: false,
              // Native-stack paints its own opaque scene background
              // (colors.background) behind every route by default --
              // without this override it would hide TiledWallpaper
              // regardless of any individual screen's own background.
              // Harmless for screens other than Home: they still paint
              // their own opaque container background on top of this.
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </AppLockGate>
      </NotificationsProvider>
    </AuthProvider>
  );
}