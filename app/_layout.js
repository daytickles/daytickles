import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '../contexts/AuthContext';
import { NotificationsProvider } from '../contexts/NotificationsContext';
import AppLockGate from '../components/AppLockGate';

// Without this, expo-notifications' own default applies: any notification
// that fires while the app is in the foreground (which local test buttons
// always hit, and a like-push can too) times out after 3s with no handler
// listening and is silently dropped -- not shown, not played, nothing.
// Foreground behavior should match backgrounded behavior for every
// notification type here (daily reminder, Awareness Cue, like pushes), so
// this shows/sounds unconditionally. shouldSetBadge is false because
// nothing in this app (client or Supabase functions) ever sets a badge
// count -- unread likes already have their own in-app counter via
// NotificationsContext.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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