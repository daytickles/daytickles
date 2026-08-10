import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { NotificationsProvider } from '../contexts/NotificationsContext';
import AppLockGate from '../components/AppLockGate';

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <AppLockGate>
          <Stack screenOptions={{ headerShown: false }} />
        </AppLockGate>
      </NotificationsProvider>
    </AuthProvider>
  );
}