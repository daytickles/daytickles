import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import AppLockGate from '../components/AppLockGate';

export default function RootLayout() {
  return (
    <AppLockGate>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </AppLockGate>
  );
}