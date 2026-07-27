import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import AppLockGate from '../components/AppLockGate';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppLockGate>
        <Stack screenOptions={{ headerShown: false }} />
      </AppLockGate>
    </AuthProvider>
  );
}