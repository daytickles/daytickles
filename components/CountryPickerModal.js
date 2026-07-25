import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList } from 'react-native';
import { C, accentFor, darken } from '../lib/theme';
import { useAuth } from '../contexts/AuthContext';
import { COUNTRIES, flagEmoji } from '../lib/country';

export default function CountryPickerModal({ visible, value, onSelect, onDismiss }) {
  const { profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : COUNTRIES;

  function handleSelect(code) {
    setQuery('');
    onSelect(code);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Country</Text>

          <TextInput
            style={styles.search}
            placeholder="Search countries..."
            placeholderTextColor={C.faint}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.row, !value && { borderColor: accentDark }]}
            onPress={() => handleSelect(null)}
          >
            <Text style={styles.rowLabel}>Prefer not to say</Text>
            {!value && <Text style={[styles.checkmark, { color: accentDark }]}>✓</Text>}
          </TouchableOpacity>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, value === item.code && { borderColor: accentDark }]}
                onPress={() => handleSelect(item.code)}
              >
                <Text style={styles.rowLabel}>{flagEmoji(item.code)}  {item.name}</Text>
                {value === item.code && <Text style={[styles.checkmark, { color: accentDark }]}>✓</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No countries match "{query}".</Text>
            }
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    width: '100%', maxHeight: '75%', backgroundColor: C.card, borderRadius: 18, padding: 16,
  },
  title: { fontSize: 16, fontWeight: '600', color: C.rustDark, marginBottom: 12 },
  search: {
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
    fontSize: 15, color: C.text, backgroundColor: C.bg,
  },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  rowLabel: { fontSize: 15, color: C.text },
  checkmark: { fontSize: 15, fontWeight: '700' },
  empty: { fontSize: 14, color: C.subtext, fontStyle: 'italic', paddingVertical: 8, textAlign: 'center' },
});
