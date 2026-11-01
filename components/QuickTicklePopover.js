import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, textOn, NATURE_ORDER, NATURE_LABELS, VIBE_COLORS } from '../lib/theme';
import NatureIcon from './NatureIcon';

// Sheet width (capped at the window width less 40dp), its gap to the
// anchor, and its minimum distance from the safe-area edges.
const SHEET_WIDTH = 236;
const SHEET_GAP = 10;
const SHEET_EDGE = 8;

// Quick Tickle's Vibe sheet, anchored to whatever opened it. anchor is
// that control's measureInWindow box ({ x, y, width, height }), or null
// to centre the sheet. Picking a Vibe only calls onPick -- the caller
// does the insert (lib/quickTickle.js insertQuickTickle) and owns the
// toast. The dimmed area around the sheet closes it, as does Android
// Back.
//
// A Modal is its own window on Android, so TalkBack focus stays inside
// it. statusBarTranslucent + navigationBarTranslucent make the Modal
// fill the whole window, so its coordinates are the same as
// measureInWindow's. The dimmed backdrop is a sibling behind the sheet,
// not its parent, so TalkBack reaches each of them separately.
export default function QuickTicklePopover({ visible, anchor, onPick, onClose, saving }) {
  const insets = useSafeAreaInsets();
  // The Modal's own size, and the sheet's laid-out height (it grows with
  // font scale).
  const [modalSize, setModalSize] = useState(null);
  const [sheetHeight, setSheetHeight] = useState(null);

  // Where the sheet goes: right edge on the anchor's right edge, 10dp
  // above it, or 10dp below when there isn't room above (large font, or
  // the anchor near the top). Always clamped inside the safe area. null
  // until the Modal and the sheet have been laid out.
  function sheetPosition() {
    if (!modalSize || sheetHeight == null) return null;
    const { width: W, height: H } = modalSize;
    const sheetWidth = Math.min(SHEET_WIDTH, W - 40);
    const minLeft = insets.left + SHEET_EDGE;
    const maxLeft = W - insets.right - SHEET_EDGE - sheetWidth;
    const minTop = insets.top + SHEET_EDGE;
    const maxTop = H - insets.bottom - SHEET_EDGE - sheetHeight;
    // Prefers the low end, so a sheet taller than the screen starts at the top.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    if (!anchor) {
      return {
        width: sheetWidth,
        left: clamp((W - sheetWidth) / 2, minLeft, maxLeft),
        top: clamp((H - sheetHeight) / 2, minTop, maxTop),
      };
    }
    const left = clamp(anchor.x + anchor.width - sheetWidth, minLeft, maxLeft);
    const above = anchor.y - SHEET_GAP - sheetHeight;
    const below = anchor.y + anchor.height + SHEET_GAP;
    let top;
    if (above >= minTop) top = above;
    else if (below <= maxTop) top = below;
    // Neither side fits whole: the side with more room, clamped.
    else top = clamp(anchor.y - minTop > maxTop - anchor.y ? above : below, minTop, maxTop);
    return { width: sheetWidth, left, top };
  }
  const pos = visible ? sheetPosition() : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={styles.backdrop}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setModalSize({ width, height });
        }}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Quick Tickle"
        />
        {/* Hidden (opacity 0) until its height is known, then placed. */}
        <View
          style={[
            styles.sheet,
            pos
              ? { left: pos.left, top: pos.top, width: pos.width }
              : { left: 0, top: 0, width: SHEET_WIDTH, opacity: 0 },
          ]}
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        >
          <Text style={styles.helper}>Tap one to log it. No writing needed.</Text>
          {NATURE_ORDER.map((key) => {
            // VibeCard.js's label colour on each Vibe's fill (textOn),
            // for both the label and the icon.
            const fill = VIBE_COLORS[key];
            const onFill = textOn(fill);
            return (
              <TouchableOpacity
                key={key}
                style={[styles.row, { backgroundColor: fill }]}
                onPress={() => onPick(key)}
                disabled={saving}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={NATURE_LABELS[key]}
                accessibilityState={{ disabled: saving }}
              >
                <NatureIcon nature={key} size={22} color={onFill} />
                <Text style={[styles.rowLabel, { color: onFill }]}>{NATURE_LABELS[key]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // EntryCard's menuBackdrop dim; the sheet is placed absolutely inside
  // it (position applied inline).
  backdrop: { flex: 1, backgroundColor: 'rgba(44,44,42,0.4)' },
  // Same shadow values as the toast.
  sheet: {
    position: 'absolute', gap: 12,
    backgroundColor: C.card, borderRadius: 22, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  // Its 4dp bottom padding plus the sheet's 12dp gap sit it above the rows.
  helper: { fontSize: 13, fontWeight: '400', color: C.subtext, paddingHorizontal: 2, paddingBottom: 4 },
  // Fill (VIBE_COLORS) and label/icon colours applied inline.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 52, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16,
  },
  rowLabel: { flexShrink: 1, fontSize: 16, fontWeight: '600' },
});
