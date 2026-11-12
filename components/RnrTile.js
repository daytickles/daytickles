import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, withAlpha } from '../lib/theme';
import { RNR_SLOTS, RNR_SLOT_LABELS } from '../lib/rnrs';

// The "+1 token" pill (same colours as the Vibe pop-up's).
const TOKEN_FILL = '#F3E8D6';
const TOKEN_INK = '#4A1F10';
// The 28dp token pill: 8dp above and below make a 44dp tap area.
const TOKEN_PILL_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

// One placed Routines and Reminders tile, used by the today pop-up and
// the full page. A transparent pill like Home's pill rows, with the
// label on top and its choices under it:
//   planned  -> Done, Move to, Skip
//   done     -> a tick, a softened pill, and "Done" (tap again to undo).
//               No Move to: a Done tile is recorded on its day in the
//               Calendar, so it stays put until it's undone.
//   skipped  -> faded label, dashed border, "Skipped" and Undo
// The label itself also carries TalkBack actions (Done, Move to each
// other slot, Skip -- not Move for a Done tile), so the same jobs can be
// done from the tile alone.
//
// Done on a planned tile goes to onDone(placement, null) when given (the
// Quick Note flow in lib/useRnrDay.js, which decides whether the centred
// Vibe pop-up opens). Without onDone it marks done directly.
// With tokensOn and onToggleEarns, a planned or skipped tile shows a
// tappable token pill: filled "+1 token" when this placed nudge earns a
// token, outlined "+ token" when it doesn't.
export default function RnrTile({
  placement, accentDark, onSetStatus, onMoveTo, onMoveSlot, onDone, tokensOn = false, onToggleEarns,
}) {
  const { label, status, slot } = placement;
  const done = status === 'done';
  const skipped = status === 'skipped';
  const earns = !!placement.earns_tokens;
  const showTokenPill = tokensOn && !!onToggleEarns && !done;

  function markDone() {
    if (onDone) onDone(placement, null);
    else onSetStatus(placement, 'done');
  }

  function handleDonePress() {
    if (done) onSetStatus(placement, 'planned');
    else markDone();
  }

  const stateWord = done ? 'done' : skipped ? 'skipped' : null;
  const a11yLabel = `${label}, ${RNR_SLOT_LABELS[slot]}${stateWord ? `, ${stateWord}` : ''}`;
  const otherSlots = RNR_SLOTS.filter((s) => s !== slot);
  const a11yActions = [
    done
      ? { name: 'undoDone', label: 'Not done' }
      : skipped
        ? { name: 'undoSkip', label: 'Undo skip' }
        : { name: 'done', label: 'Done' },
    ...(done ? [] : otherSlots.map((s) => ({ name: `move-${s}`, label: `Move to ${RNR_SLOT_LABELS[s]}` }))),
    ...(!done && !skipped ? [{ name: 'skip', label: 'Skip' }] : []),
  ];

  function handleAction(e) {
    const name = e.nativeEvent.actionName;
    if (name === 'done') markDone();
    else if (name === 'undoDone' || name === 'undoSkip') onSetStatus(placement, 'planned');
    else if (name === 'skip') onSetStatus(placement, 'skipped');
    else if (name.startsWith('move-') && !done) onMoveSlot(placement, name.slice(5));
  }

  return (
    <View
      style={[
        styles.pill,
        { borderColor: done ? withAlpha(accentDark, 0.5) : accentDark },
        done && styles.pillDone,
        skipped && styles.pillSkipped,
      ]}
    >
      <View
        style={styles.labelRow}
        accessible
        accessibilityLabel={a11yLabel}
        accessibilityActions={a11yActions}
        onAccessibilityAction={handleAction}
      >
        {done && <Ionicons name="checkmark-circle" size={18} color={accentDark} />}
        <Text style={[styles.label, skipped && styles.labelSkipped]}>{label}</Text>
      </View>

      <View style={styles.actionsRow}>
        {skipped ? (
          <>
            <Text style={styles.skippedText}>Skipped</Text>
            <ActionButton
              text="Undo"
              a11yLabel={`Undo skip: ${label}`}
              onPress={() => onSetStatus(placement, 'planned')}
              color={accentDark}
            />
          </>
        ) : (
          <>
            <ActionButton
              text="Done"
              icon={done ? 'checkmark' : null}
              a11yLabel={done ? `Done: ${label}. Tap to undo` : `Done: ${label}`}
              a11yState={{ checked: done }}
              onPress={handleDonePress}
              color={accentDark}
            />
            {!done && (
              <>
                <ActionButton
                  text="Move to"
                  a11yLabel={`Move ${label}`}
                  onPress={() => onMoveTo(placement)}
                  color={accentDark}
                />
                <ActionButton
                  text="Skip"
                  a11yLabel={`Skip ${label}`}
                  onPress={() => onSetStatus(placement, 'skipped')}
                  color={accentDark}
                />
              </>
            )}
          </>
        )}
        {showTokenPill && (
          <TouchableOpacity
            onPress={() => onToggleEarns(placement)}
            hitSlop={TOKEN_PILL_HIT_SLOP}
            style={[styles.tokenPill, earns ? styles.tokenPillOn : styles.tokenPillOff]}
            accessibilityRole="switch"
            accessibilityLabel={`Earn a token: ${label}`}
            accessibilityState={{ checked: earns }}
          >
            <Text style={styles.tokenPillText}>{earns ? '+1 token' : '+ token'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ActionButton({ text, icon, a11yLabel, a11yState, onPress, color }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={a11yState}
    >
      {!!icon && <Ionicons name={icon} size={14} color={color} />}
      <Text style={[styles.actionText, { color }]}>{text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Home's goalPill shape (radius 20, 1dp border, 12dp sides), taller to
  // hold the choices row. A light card wash keeps the label readable over
  // the wallpaper; the border is the user's accent, like New Tickle.
  pill: {
    borderRadius: 20, borderWidth: 1,
    paddingTop: 10, paddingBottom: 2, paddingHorizontal: 12,
    backgroundColor: withAlpha(C.card, 0.55),
  },
  // Softened: the wash and border fade back, the label stays full colour.
  pillDone: { backgroundColor: withAlpha(C.card, 0.25) },
  pillSkipped: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: C.faint },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: C.text },
  // Faded with C.subtext rather than opacity, so it still passes 4.5:1.
  labelSkipped: { color: C.subtext },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 },
  // 44dp tall tap targets.
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    minHeight: 44, paddingHorizontal: 6,
  },
  actionText: { fontSize: 13, fontWeight: '700' },
  skippedText: { fontSize: 13, color: C.subtext, paddingRight: 4 },
  // At the right end of the choices row (wraps under them on a narrow row).
  tokenPill: {
    marginLeft: 'auto', height: 28, borderRadius: 14, paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  tokenPillOn: { backgroundColor: TOKEN_FILL, borderWidth: 1, borderColor: TOKEN_FILL },
  tokenPillOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: TOKEN_INK },
  tokenPillText: { fontSize: 13, fontWeight: '700', color: TOKEN_INK },
});
