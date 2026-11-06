import { useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { C, lighten, withAlpha } from '../../lib/theme';
import RnrsPopup from '../../components/RnrsPopup';

// Roughly midway between C.text and C.subtext -- distinct enough from
// the inactive icons' C.subtext to still show which tab is selected,
// without the much heavier/darker contrast plain C.text had.
const tabBarActiveColor = lighten(C.text, 0.35);
// Inactive tab icons keep the old, lighter secondary grey: C.subtext is
// now darker than tabBarActiveColor, which would flip the selected-tab
// cue. Icons only need 3:1 (this is 3.3:1 on cream).
const tabBarInactiveColor = '#888780';

const TAB_BAR_BACKING = withAlpha(C.bg, 0.85);

export default function TabsLayout() {
  // The Routines and Reminders button opens today's pop-up instead of
  // switching tab; the full page (rnrs.js) is reached from inside it.
  const [rnrsOpen, setRnrsOpen] = useState(false);
  const rnrsButtonRef = useRef(null);

  // TalkBack focus back on the button once the pop-up has closed -- unless
  // it closed to go somewhere (the full page, or Tickle it).
  function closeRnrs({ leaving } = {}) {
    setRnrsOpen(false);
    if (leaving) return;
    setTimeout(() => {
      if (rnrsButtonRef.current) AccessibilityInfo.sendAccessibilityEvent(rnrsButtonRef.current, 'focus');
    }, 300);
  }

  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBarActiveColor,
        tabBarInactiveTintColor: tabBarInactiveColor,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        // Backing under the blur: on Android expo-blur draws only a
        // translucent light tint, so a dark photo scrolled under this
        // floating bar showed through and washed out the grey icons.
        // 85% C.bg keeps them legible over anything while a light
        // screen behind it looks the same as before.
        tabBarBackground: () => (
          <>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: TAB_BAR_BACKING }]} />
            <BlurView intensity={75} tint="light" style={StyleSheet.absoluteFill} />
          </>
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
      {/* Routines and Reminders. Its own button (tabBarButton) opens the
          today pop-up rather than this page; the pop-up's "Open Routines
          and Reminders" navigates here, which shows it as selected. */}
      <Tabs.Screen
        name="rnrs"
        options={{
          title: 'Nudges & Notes',
          tabBarAccessibilityLabel: "Nudges & Notes, today's tiles",
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle-outline" color={color} size={size} />,
          tabBarButton: (props) => (
            <Pressable
              {...props}
              ref={rnrsButtonRef}
              onPress={() => setRnrsOpen(true)}
            />
          ),
        }}
      />
      {/* Calendar is out of the bar: opened from the calendar icon in
          CornerNav. The route and its deep link stay. */}
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          href: null,
        }}
      />
      {/* The other CornerNav destinations, the same way: out of the bar,
          opened from their CornerNav icons, so the top row and this bar
          stay on screen. Routes and deep links are unchanged. */}
      <Tabs.Screen
        name="weekly-summary"
        options={{
          title: 'Your Week',
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          href: null,
        }}
      />
      <Tabs.Screen
        name="founding-member"
        options={{
          title: 'Moji Quest',
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          href: null,
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
    <RnrsPopup visible={rnrsOpen} onClose={closeRnrs} />
    </>
  );
}
