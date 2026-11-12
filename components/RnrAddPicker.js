import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken } from '../lib/theme';
import { showAlert, showSaveFailed } from '../lib/themedAlert';
import {
  STARTER_TILES, RNR_SLOT_LABELS, RNR_TILE_MAX_LENGTH,
  fetchMyTiles, createTile, renameTile, archiveTile,
} from '../lib/rnrs';
import { BUTTON_HEIGHT, BUTTON_HIT_SLOP, BUTTON_RADIUS } from '../lib/buttonSize';

// A tile of your own sits 2dp above its Rename / Delete row (44dp tall),
// so its bottom slop is limited to that gap; the top keeps the full 7.
const MY_TILE_PILL_HIT_SLOP = { top: BUTTON_HIT_SLOP.top, bottom: 2 };

// Add a tile to one slot of a day. Three parts, top to bottom:
//   Make a new tile -- a text field (80 characters) and Add. It sits at
//     the top so the keyboard never covers it inside the Modal.
//   Ideas -- the starter tiles suggested for this slot.
//   My tiles -- the user's own tiles; tap one to add it, or Rename /
//     Delete it. Delete archives: the tile leaves this list, and days it
//     was already placed on keep it with its label.
// Picking anything calls onAdd({ starterKey } | { tileId }, plus
// earnsTokens) and closes.
//
// Earn tokens (above the three parts, hidden while Tokens & Rewards is
// off): whatever is added next earns +1 token when it is logged as a
// Quick Note (migration 0084). Off every time the picker opens.
export default function RnrAddPicker({ slot, onAdd, onClose }) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const tokensOn = profile?.tokens_enabled !== false;
  const visible = !!slot;
  const [earnsTokens, setEarnsTokens] = useState(false);
  const earns = tokensOn && earnsTokens;
  const [myTiles, setMyTiles] = useState([]);
  const [tilesLoading, setTilesLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    if (!visible || !userId) return undefined;
    let cancelled = false;
    setNewLabel('');
    setRenamingId(null);
    setEarnsTokens(false);
    setTilesLoading(true);
    fetchMyTiles(userId).then(({ data, error }) => {
      if (cancelled) return;
      setTilesLoading(false);
      if (error) console.warn('RnrAddPicker: tiles load failed', error);
      setMyTiles(data);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, userId]);

  const ideas = STARTER_TILES.filter((t) => t.slot === slot);

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label || creating) return;
    setCreating(true);
    const { data, error } = await createTile(userId, label);
    setCreating(false);
    if (error || !data) {
      console.warn('RnrAddPicker: create failed', error);
      showSaveFailed();
      return;
    }
    setMyTiles((prev) => [...prev, data]);
    onAdd({ tileId: data.id, earnsTokens: earns });
  }

  function startRename(tile) {
    setRenamingId(tile.id);
    setRenameText(tile.label);
  }

  async function saveRename(tile) {
    const label = renameText.trim();
    if (!label) return;
    const previous = myTiles;
    setMyTiles((prev) => prev.map((t) => (t.id === tile.id ? { ...t, label } : t)));
    setRenamingId(null);
    const { error } = await renameTile(tile.id, label);
    if (error) {
      setMyTiles(previous);
      showSaveFailed();
    }
  }

  function confirmDelete(tile) {
    showAlert(
      'Delete this tile?',
      `"${tile.label}" leaves My tiles. Days it's already on keep it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(tile) },
      ]
    );
  }

  async function handleDelete(tile) {
    const previous = myTiles;
    setMyTiles((prev) => prev.filter((t) => t.id !== tile.id));
    const { error } = await archiveTile(tile.id);
    if (error) {
      setMyTiles(previous);
      showSaveFailed();
    }
  }

  const slotLabel = slot ? RNR_SLOT_LABELS[slot] : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title} accessibilityRole="header">Add to {slotLabel}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={C.subtext} />
            </TouchableOpacity>
          </View>

          {tokensOn && (
            <View style={styles.earnRow}>
              <View style={styles.earnText}>
                <Text style={styles.earnLabel}>Earn tokens</Text>
                <Text style={styles.earnHelper}>+1 token when you log it with a Vibe.</Text>
              </View>
              <Switch
                value={earnsTokens}
                onValueChange={setEarnsTokens}
                trackColor={{ false: C.faint, true: accentDark }}
                accessibilityLabel="Earn tokens: +1 token when you log it with a Vibe"
              />
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel} accessibilityRole="header">Make a new tile</Text>
            <View style={styles.newRow}>
              <TextInput
                style={styles.input}
                value={newLabel}
                onChangeText={setNewLabel}
                maxLength={RNR_TILE_MAX_LENGTH}
                placeholder="e.g. Water the plants"
                placeholderTextColor={C.subtext}
                accessibilityLabel={`New tile, up to ${RNR_TILE_MAX_LENGTH} characters`}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <TouchableOpacity
                onPress={handleCreate}
                disabled={!newLabel.trim() || creating}
                style={[styles.smallButton, { borderColor: accentDark }, (!newLabel.trim() || creating) && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel={`Add new tile to ${slotLabel}`}
                accessibilityState={{ disabled: !newLabel.trim() || creating }}
              >
                <Text style={[styles.smallButtonText, { color: accentDark }]}>Add</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.counter} accessibilityElementsHidden importantForAccessibility="no">
              {newLabel.length}/{RNR_TILE_MAX_LENGTH}
            </Text>

            <Text style={styles.sectionLabel} accessibilityRole="header">Ideas</Text>
            <View style={styles.pillWrap}>
              {ideas.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => onAdd({ starterKey: t.key, earnsTokens: earns })}
                  hitSlop={BUTTON_HIT_SLOP}
                  style={[styles.pill, { borderColor: accentDark }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${t.label}`}
                >
                  <Text style={styles.pillText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel} accessibilityRole="header">My tiles</Text>
            {tilesLoading && myTiles.length === 0 && <ActivityIndicator color={C.rust} style={styles.loader} />}
            {!tilesLoading && myTiles.length === 0 && (
              <Text style={styles.hint}>Tiles you make show up here.</Text>
            )}
            {myTiles.map((t) => (
              <View key={t.id} style={styles.myTileRow}>
                {renamingId === t.id ? (
                  <>
                    <TextInput
                      style={styles.input}
                      value={renameText}
                      onChangeText={setRenameText}
                      maxLength={RNR_TILE_MAX_LENGTH}
                      autoFocus
                      accessibilityLabel={`Rename tile, up to ${RNR_TILE_MAX_LENGTH} characters`}
                      returnKeyType="done"
                      onSubmitEditing={() => saveRename(t)}
                    />
                    <View style={styles.myTileActions}>
                      <TextAction text="Save" color={accentDark} onPress={() => saveRename(t)} a11yLabel="Save name" />
                      <TextAction text="Cancel" color={C.subtext} onPress={() => setRenamingId(null)} a11yLabel="Cancel rename" />
                    </View>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => onAdd({ tileId: t.id, earnsTokens: earns })}
                      hitSlop={MY_TILE_PILL_HIT_SLOP}
                      style={[styles.pill, { borderColor: accentDark }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${t.label}`}
                    >
                      <Text style={styles.pillText}>{t.label}</Text>
                    </TouchableOpacity>
                    <View style={styles.myTileActions}>
                      <TextAction text="Rename" color={accentDark} onPress={() => startRename(t)} a11yLabel={`Rename ${t.label}`} />
                      <TextAction text="Delete" color={C.subtext} onPress={() => confirmDelete(t)} a11yLabel={`Delete ${t.label}`} />
                    </View>
                  </>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TextAction({ text, color, onPress, a11yLabel }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.textAction} accessibilityRole="button" accessibilityLabel={a11yLabel}>
      <Text style={[styles.textActionText, { color }]}>{text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'flex-start', alignItems: 'center', padding: 16, paddingTop: 48,
  },
  sheet: {
    width: '100%', maxWidth: 440, maxHeight: '90%',
    backgroundColor: C.bg, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: 'bold', color: C.rustDark },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  scrollContent: { paddingBottom: 8 },
  // Earn tokens: label and helper at the left, the switch at the right.
  earnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginTop: 4 },
  earnText: { flex: 1 },
  earnLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  earnHelper: { fontSize: 13, color: C.subtext, marginTop: 1 },
  // Home's cardLabel type.
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.rustDark, marginTop: 12, marginBottom: 6 },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
    fontSize: 14, color: C.text,
  },
  counter: { fontSize: 12, color: C.subtext, textAlign: 'right', marginTop: 2 },
  smallButton: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 16,
    borderRadius: 22, borderWidth: 1.5, backgroundColor: C.bg,
  },
  smallButtonText: { fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  // 14 between wrapped lines, so the pills' 7dp tap-area slops meet
  // without overlapping; 6 between pills on a line (no side slop).
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 6 },
  // The app-wide pill height (lib/buttonSize.js), 44dp to tap. A little
  // vertical padding (4) because a long tile name can wrap to two lines.
  pill: {
    alignSelf: 'flex-start', minHeight: BUTTON_HEIGHT, maxWidth: '100%', justifyContent: 'center',
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: BUTTON_RADIUS, borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: C.text },
  loader: { marginVertical: 8 },
  hint: { fontSize: 13, color: C.subtext },
  myTileRow: { marginBottom: 8, gap: 2 },
  myTileActions: { flexDirection: 'row', gap: 4 },
  textAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  textActionText: { fontSize: 13, fontWeight: '700' },
});
