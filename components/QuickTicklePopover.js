import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NATURE_ORDER, NATURE_LABELS, VIBE_CARD_PALETTES } from '../lib/theme';
import NatureIcon from './NatureIcon';
import { useHomePalette } from '../lib/homePalette';

// The pop-up's Vibe colours follow the chosen Home colour set (the same
// colours as Home's Vibe cards, lib/homePalette.js); the icons on them stay
// the muted set's cream, which every set keeps.
const MUTED = VIBE_CARD_PALETTES.muted;

const INK = '#425762';
const PANEL_FILL = '#FBF3E7';
const LINE = '#EADFCB';

// Panel width (capped at the window width less the side margins), its gap
// to the anchor, and its minimum distance from the safe-area edges: 20dp
// at the sides, 8dp at the top and bottom.
const SHEET_WIDTH = 300;
const SHEET_GAP = 10;
const SHEET_SIDE = 20;
const SHEET_EDGE = 8;
// The pointer: a 16dp square turned 45deg, so its tip sticks out about
// 8dp past the panel edge (inside the 10dp gap). POINTER_INSET keeps it
// on the panel when the anchor is near one of its ends.
const POINTER_SIZE = 16;
const POINTER_OFFSET = -6;
const POINTER_INSET = 16;

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
  const { vibe } = useHomePalette();
  // The Modal's own size, and the sheet's laid-out height (it grows with
  // font scale).
  const [modalSize, setModalSize] = useState(null);
  const [sheetHeight, setSheetHeight] = useState(null);

  // Where the sheet goes: right edge on the anchor's right edge, 10dp
  // above it, or 10dp below when there isn't room above (large font, or
  // the anchor near the top). Always clamped inside the safe area. null
  // until the Modal and the sheet have been laid out. side says where the
  // panel ended up -- 'above' the anchor (pointer on its bottom edge),
  // 'below' it (pointer on top), or null (no pointer: no anchor, or the
  // panel had to overlap it).
  function sheetPosition() {
    if (!modalSize || sheetHeight == null) return null;
    const { width: W, height: H } = modalSize;
    const sheetWidth = Math.min(SHEET_WIDTH, W - 2 * SHEET_SIDE);
    const minLeft = insets.left + SHEET_SIDE;
    const maxLeft = W - insets.right - SHEET_SIDE - sheetWidth;
    const minTop = insets.top + SHEET_EDGE;
    const maxTop = H - insets.bottom - SHEET_EDGE - sheetHeight;
    // Prefers the low end, so a sheet taller than the screen starts at the top.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    if (!anchor) {
      return {
        width: sheetWidth,
        left: clamp((W - sheetWidth) / 2, minLeft, maxLeft),
        top: clamp((H - sheetHeight) / 2, minTop, maxTop),
        side: null,
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
    let side = null;
    if (top + sheetHeight <= anchor.y) side = 'above';
    else if (top >= anchor.y + anchor.height) side = 'below';
    // Pointer centre, across the panel: the anchor's centre (for Home's
    // 56dp button, 28dp in from the panel's right edge), kept on the panel.
    const pointerX = clamp(anchor.x + anchor.width / 2 - left, POINTER_INSET, sheetWidth - POINTER_INSET);
    return { width: sheetWidth, left, top, side, pointerX };
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
          {/* First child, so the rows draw over it. Only its two outer
              edges have a border, so it reads as part of the panel's
              outline. Decoration only, hidden from TalkBack. */}
          {!!pos?.side && (
            <View
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.pointer,
                pos.side === 'above' ? styles.pointerDown : styles.pointerUp,
                { left: pos.pointerX - POINTER_SIZE / 2 },
              ]}
            />
          )}
          <View style={styles.headingBlock}>
            <Text style={styles.heading} accessibilityRole="header">Quick Tickle</Text>
            <Text style={styles.helper}>Tap one to log it. No writing needed.</Text>
          </View>
          <View style={styles.rows}>
            {NATURE_ORDER.map((key) => {
              const color = vibe[key];
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.row}
                  onPress={() => onPick(key)}
                  disabled={saving}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={NATURE_LABELS[key]}
                  accessibilityState={{ disabled: saving }}
                >
                  <View
                    style={[styles.badge, { backgroundColor: color }]}
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                  >
                    <NatureIcon nature={key} size={22} color={MUTED.text} />
                  </View>
                  <Text style={styles.rowLabel}>{NATURE_LABELS[key]}</Text>
                  <View
                    style={[styles.dot, { backgroundColor: color }]}
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // EntryCard's menuBackdrop dim; the sheet is placed absolutely inside
  // it (position applied inline).
  backdrop: { flex: 1, backgroundColor: 'rgba(44,44,42,0.4)' },
  // Soft warm shadow: the shadow* keys are iOS; Android uses elevation
  // only, which shows fainter.
  sheet: {
    position: 'absolute',
    backgroundColor: PANEL_FILL, borderRadius: 30, borderWidth: 1, borderColor: LINE,
    paddingTop: 16, paddingHorizontal: 14, paddingBottom: 14,
    shadowColor: '#4A1F10', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  pointer: {
    position: 'absolute', width: POINTER_SIZE, height: POINTER_SIZE,
    backgroundColor: PANEL_FILL, borderColor: LINE,
    transform: [{ rotate: '45deg' }],
  },
  // Turned 45deg, the square's bottom-right corner is the downward tip
  // and its top-left corner the upward one; the border goes on the two
  // edges meeting at the tip.
  pointerDown: { bottom: POINTER_OFFSET, borderRightWidth: 1, borderBottomWidth: 1 },
  pointerUp: { top: POINTER_OFFSET, borderLeftWidth: 1, borderTopWidth: 1 },
  headingBlock: { marginBottom: 12, paddingHorizontal: 2 },
  heading: { fontSize: 19, fontWeight: '700', color: INK },
  helper: { marginTop: 2, fontSize: 14, color: '#5F5B52' },
  rows: { gap: 10 },
  // minHeight, so a large font scale grows the row instead of clipping.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 60, paddingVertical: 8, paddingLeft: 10, paddingRight: 16,
    backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: LINE,
    shadowColor: '#4A1F10', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 17, fontWeight: '600', color: INK },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
