import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { accentFor, darken } from '../../lib/theme';

export default function TabsLayout() {
  const { profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accentDark,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: 'Feed', tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="pinboard"
        options={{ title: 'Tickle Pics', tabBarIcon: ({ color, size }) => <Ionicons name="images-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
