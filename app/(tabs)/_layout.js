import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { C, lighten } from '../../lib/theme';

// Roughly midway between C.text and C.subtext -- distinct enough from
// the inactive icons' C.subtext to still show which tab is selected,
// without the much heavier/darker contrast plain C.text had.
const tabBarActiveColor = lighten(C.text, 0.35);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBarActiveColor,
        tabBarInactiveTintColor: C.subtext,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView intensity={75} tint="light" style={StyleSheet.absoluteFill} />
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Tickle Stash',
          tabBarAccessibilityLabel: 'Tickle Stash',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarAccessibilityLabel: 'Calendar',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pinboard"
        options={{
          title: 'Tickle Pics',
          tabBarAccessibilityLabel: 'Tickle Pics',
          tabBarIcon: ({ color, size }) => <Ionicons name="images-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
