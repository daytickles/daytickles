// components/SettingsSection.js
//
// One collapsible group on the Settings screen: a heading button (small
// uppercase name + chevron) and, when open, its cards. No animation. The
// open / closed state lives in the Settings screen (kept while the app is
// open, not saved), so this component is stateless.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';

export default function SettingsSection({ title, open, onToggle, children }) {
  return (
    <View style={styles.section}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.heading}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${open ? 'expanded' : 'collapsed'}`}
      >
        <Text style={styles.headingText}>{title.toUpperCase()}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.subtext} />
      </TouchableOpacity>
      {open && children}
    </View>
  );
}

const styles = StyleSheet.create({
  // 4dp extra space above each heading.
  section: { marginTop: 4 },
  // At least 44dp tall (minHeight, so it grows with a large font); the
  // name wraps rather than pushing the chevron off.
  heading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    minHeight: 44,
  },
  // The same small uppercase look as the Notifications day headers.
  headingText: { flexShrink: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.9, color: C.subtext },
});
