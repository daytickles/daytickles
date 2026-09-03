import { Modal, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C } from '../lib/theme';

// scenario distinguishes what deleting this photo actually does, per
// pinboard.js's handleDeletePhoto -- 'plain' (default) is a photo with
// no linked entry at all, unchanged from before this prop existed.
// 'sole': the photo IS a photo-only Tickle (its only content) -- deleting
//   it deletes that Tickle too.
// 'pinned': the photo is pinned to a separately-written Tickle via the
//   Tickle button -- deleting it only removes the photo; that Tickle's
//   text is untouched.
// 'both': a photo can be both at once (the Tickle button still works on
//   a photo-only Tickle's own photo) -- combined warning listing both
//   consequences, rather than picking one arbitrarily.
const COPY = {
  plain: {
    title: 'Delete this photo?',
    body: "This removes it from your Tickle Pics and deletes the photo from this device. This can't be undone.",
  },
  sole: {
    title: 'Delete this Tickle?',
    body: "This photo is the whole Tickle — there's no text or anything else attached to it. Deleting it removes the photo from this device and deletes the Tickle itself. This can't be undone.",
  },
  pinned: {
    title: 'Delete this photo?',
    body: "This photo is attached to a Tickle you wrote. Deleting it removes the photo from this device and from that Tickle — the Tickle's own text stays exactly as it is. This can't be undone.",
  },
  both: {
    title: 'Delete this photo?',
    body: "This photo is both a Tickle on its own and attached to another Tickle you wrote. Deleting it will delete the photo-only Tickle entirely, and remove the photo from the other Tickle — that Tickle's own text stays exactly as it is. This can't be undone.",
  },
};

// Same Modal/backdrop/sheet/destructive-button shape as DeleteAccountModal
// — deliberately without its typed-confirmation gate, which that
// component's own comment reserves for the account-wide irreversible
// case. A single photo just needs the themed equivalent of a destructive
// Alert.alert, not a harder-to-hit-by-accident gate.
export default function DeletePhotoModal({ visible, scenario = 'plain', onConfirm, onCancel }) {
  const { title, body } = COPY[scenario] ?? COPY.plain;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <TouchableOpacity style={styles.deleteButton} onPress={onConfirm}>
            <Text style={styles.deleteButtonText}>Delete Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  sheet: { width: '100%', backgroundColor: C.bg, borderRadius: 18, padding: 24 },
  title: { fontSize: 18, fontWeight: '700', color: C.rustDark, marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, color: C.text, lineHeight: 20, marginBottom: 16, textAlign: 'center' },
  deleteButton: {
    backgroundColor: C.error,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteButtonText: { color: C.bg, fontWeight: '700', fontSize: 15 },
  cancel: { alignItems: 'center' },
  cancelText: { fontSize: 14, color: C.subtext, fontWeight: '600' },
});
