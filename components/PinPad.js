// components/PinPad.js
//
// Reusable 4-digit numeric keypad — used both by the app-lock screen and
// by Settings' PIN setup flow. Deliberately a custom on-screen keypad
// rather than a TextInput+system keyboard, since the lock screen needs to
// present its own self-contained UI immediately on resume, without
// depending on the OS keyboard's timing.
//
// Doesn't depend on AuthContext/accent theme — the lock screen renders
// outside AuthProvider (see components/AppLockGate.js), so this uses
// fixed theme colors only.

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C } from '../lib/theme';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function PinPad({ title, subtitle, error, onComplete }) {
  const [digits, setDigits] = useState('');

  function handleKey(key) {
    if (key === '') return;
    if (key === 'del') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (digits.length >= PIN_LENGTH) return;

    const next = digits + key;
    setDigits(next);
    if (next.length === PIN_LENGTH) {
      onComplete(next);
      setDigits('');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.dotsRow}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < digits.length && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.keypad}>
        {KEYS.map((key, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.key, key === '' && styles.keyHidden]}
            onPress={() => handleKey(key)}
            disabled={key === ''}
          >
            <Text style={styles.keyText}>{key === 'del' ? '⌫' : key}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '600', color: C.subtext, marginBottom: 12, textAlign: 'center' },
  error: { fontSize: 13, color: C.error, marginBottom: 12, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: C.rustDark,
  },
  dotFilled: { backgroundColor: C.rustDark },
  keypad: {
    flexDirection: 'row', flexWrap: 'wrap',
    width: 3 * 72, justifyContent: 'space-between',
  },
  key: {
    width: 72, height: 72, borderRadius: 36, marginBottom: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  keyHidden: { backgroundColor: 'transparent', borderWidth: 0 },
  keyText: { fontSize: 24, fontWeight: '600', color: C.text },
});
