// components/DeleteAccountModal.js
//
// Final confirmation step for account deletion, reached only after the
// initial Alert.alert warning in settings.js. Typing DELETE exactly is
// what enables the actual delete button — deliberately a harder-to-hit-
// by-accident gate than every other destructive action in this app
// (which use a single Alert.alert), since this is the only one that's
// truly irreversible and destroys the entire account, not just one
// piece of content.

import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Modal, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { C } from '../lib/theme';

const CONFIRM_WORD = 'DELETE';

export default function DeleteAccountModal({ visible, deleting, error, onConfirm, onCancel }) {
  const [input, setInput] = useState('');
  const canConfirm = input.trim() === CONFIRM_WORD;

  function handleCancel() {
    if (deleting) return;
    setInput('');
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Delete your account</Text>
          <Text style={styles.body}>
            This permanently deletes your account and everything in it — every tickle, like,
            follow, goal, and share. There is no recovery. Type DELETE to confirm.
          </Text>

          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="DELETE"
            placeholderTextColor={C.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.deleteButton, !canConfirm && styles.deleteButtonDisabled]}
            onPress={onConfirm}
            disabled={!canConfirm || deleting}
          >
            {deleting ? (
              <ActivityIndicator color={C.bg} />
            ) : (
              <Text style={styles.deleteButtonText}>Permanently Delete Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCancel} style={styles.cancel} disabled={deleting}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    width: '100%', backgroundColor: C.bg, borderRadius: 18, padding: 24,
  },
  title: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, color: C.text, lineHeight: 20, marginBottom: 16, textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    padding: 12, marginBottom: 12, fontSize: 16, textAlign: 'center',
    backgroundColor: C.card, color: C.text, fontWeight: '700', letterSpacing: 2,
  },
  error: { fontSize: 13, color: C.error, textAlign: 'center', marginBottom: 12 },
  deleteButton: {
    backgroundColor: C.error, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 12,
  },
  deleteButtonDisabled: { opacity: 0.35 },
  deleteButtonText: { color: C.bg, fontWeight: '700', fontSize: 15 },
  cancel: { alignItems: 'center' },
  cancelText: { fontSize: 14, color: C.subtext, fontWeight: '600' },
});
