// app/weekly-summary.js
//
// Placeholder destination for Home's new Weekly Summary icon -- the
// real feature (destination content, Settings day-picker, freshness
// indicator) is being scoped and built as its own session separately.
// This is deliberately just an honest "coming soon," not a stub
// pretending the feature already exists.

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C } from '../lib/theme';

export default function WeeklySummary() {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.backLink}>‹ Back</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Weekly Summary</Text>
        <Text style={styles.message}>Coming soon — a weekly recap of your Tickles is on its way.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 20, paddingTop: 60 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 12 },
  message: { fontSize: 15, color: C.subtext, textAlign: 'center', lineHeight: 22 },
});
