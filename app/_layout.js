import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import AppLockGate from '../components/AppLockGate';
import BackgroundWallpaper from '../components/BackgroundWallpaper';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppLockGate>
        <Stack screenOptions={{ headerShown: false }} />
        {/* After Stack, not before -- each screen has its own opaque
            background, so anything painted before Stack would be
            completely hidden underneath it. */}
        {/* Parked, still debugging sizing/clipping — see BackgroundWallpaper.js */}
        {/* <BackgroundWallpaper /> */}
      </AppLockGate>
    </AuthProvider>
  );
}