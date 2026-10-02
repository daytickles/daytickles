import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C } from '../lib/theme';

// Same sheet as GoalTagModal, for TickleTales (lib/tales.js). `tales` is
// the owner's full list; only Ongoing ones are offered as a new tag
// target (a Completed Tale is closed to new chapters -- also enforced
// server-side by enforce_tale_chapter_rules). The entry's current Tale
// is shown read-only above the list when it's Completed, same as an
// achieved goal in GoalTagModal.
//
// Only a public entry can be tagged. The ⋯ menu still opens this for a
// private entry that's already tagged (it stays tagged across
// Un-Ripple), so the owner can remove the tag -- the list itself is
// replaced by a one-line explanation in that case.
export default function TaleTagModal({ entry, tales, onAssign, onDismiss }) {
  const isPublic = entry?.visibility === 'public';
  const taggedTale = entry?.tale_id ? tales.find((t) => t.id === entry.tale_id) : null;
  const ongoingTales = tales.filter((t) => !t.completed_at);

  return (
    <Modal visible={!!entry} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.pickerTitle}>Add to a Tale</Text>

          {taggedTale?.completed_at && (
            <View style={[styles.pickerRow, styles.pickerRowReadOnly]}>
              <Ionicons name="book" size={16} color={C.faint} />
              <Text style={[styles.pickerRowLabel, styles.pickerRowLabelMuted]} numberOfLines={1}>
                {taggedTale.title} (complete)
              </Text>
            </View>
          )}

          {isPublic ? (
            <>
              {ongoingTales.map((t) => {
                const isCurrent = t.id === entry?.tale_id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.pickerRow, isCurrent && styles.pickerRowCurrent]}
                    onPress={() => onAssign(t.id)}
                  >
                    <Ionicons name={isCurrent ? 'book' : 'book-outline'} size={16} color={C.rust} />
                    <Text style={styles.pickerRowLabel} numberOfLines={1}>{t.title}</Text>
                  </TouchableOpacity>
                );
              })}
              {ongoingTales.length === 0 && (
                <Text style={styles.pickerEmpty}>No ongoing Tales yet.</Text>
              )}
            </>
          ) : (
            <Text style={styles.pickerEmpty}>
              Only Rippled Tickles can be Tics. Ripple this one to add it to a Tale.
            </Text>
          )}

          {!!entry?.tale_id && (
            <TouchableOpacity style={styles.pickerRow} onPress={() => onAssign(null)}>
              <Ionicons name="close-circle-outline" size={16} color={C.subtext} />
              <Text style={styles.pickerRowLabel}>Remove from Tale</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.manageLink}
            onPress={() => {
              onDismiss();
              router.push('/tales');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.manageLinkText}>Start or manage Tales ›</Text>
          </TouchableOpacity>
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
  pickerSheet: {
    width: '100%', backgroundColor: C.card, borderRadius: 18, padding: 16,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: C.rustDark, marginBottom: 12 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  pickerRowCurrent: { borderColor: C.rust },
  pickerRowLabel: { fontSize: 15, color: C.text, marginLeft: 12, flexShrink: 1 },
  pickerRowLabelMuted: { color: C.subtext },
  pickerRowReadOnly: { opacity: 0.85 },
  pickerEmpty: { fontSize: 14, color: C.subtext, fontStyle: 'italic', paddingVertical: 8 },
  manageLink: { alignSelf: 'flex-end', marginTop: 4 },
  manageLinkText: { fontSize: 13, fontWeight: '600', color: C.rust },
});
