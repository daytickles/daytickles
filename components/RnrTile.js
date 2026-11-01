import { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, withAlpha } from '../lib/theme';
import { RNR_SLOTS, RNR_SLOT_LABELS } from '../lib/rnrs';

// One placed Routines and Reminders tile, used by the today pop-up and
// the full page. A transparent pill like Home's pill rows, with the
// label on top and its choices under it:
//   planned  -> Done, Move to, Skip
//   done     -> a tick, a softened pill, "Done" (tap again to undo),
//               Move to, and "Log it" while showLogIt is on
//   skipped  -> faded label, dashed border, "Skipped" and Undo
// The label itself also carries TalkBack actions (Done, Move to each
// other slot, Skip), so the same jobs can be done from the tile alone.
export default function RnrTile({ placement, accentDark, showLogIt, onSetStatus, onMoveTo, onMoveSlot, onLogIt }) {
  const logItRef = useRef(null);
  const { label, status, slot } = placement;
  const done = status === 'done';
  const skipped = status === 'skipped';

  const stateWord = done ? 'done' : skipped ? 'skipped' : null;
  const a11yLabel = `${label}, ${RNR_SLOT_LABELS[slot]}${stateWord ? `, ${stateWord}` : ''}`;
  const otherSlots = RNR_SLOTS.filter((s) => s !== slot);
  const a11yActions = [
    done
      ? { name: 'undoDone', label: 'Not done' }
      : skipped
        ? { name: 'undoSkip', label: 'Undo skip' }
        : { name: 'done', label: 'Done' },
    ...otherSlots.map((s) => ({ name: `move-${s}`, label: `Move to ${RNR_SLOT_LABELS[s]}` })),
    ...(!done && !skipped ? [{ name: 'skip', label: 'Skip' }] : []),
  ];

  function handleAction(e) {
    const name = e.nativeEvent.actionName;
    if (name === 'done') onSetStatus(placement, 'done');
    else if (name === 'undoDone' || name === 'undoSkip') onSetStatus(placement, 'planned');
    else if (name === 'skip') onSetStatus(placement, 'skipped');
    else if (name.startsWith('move-')) onMoveSlot(placement, name.slice(5));
  }

  // Measured so the Vibe sheet opens anchored to the pill.
  function handleLogIt() {
    const node = logItRef.current;
    if (!node?.measureInWindow) {
      onLogIt(placement, null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      onLogIt(placement, width > 0 ? { x, y, width, height } : null);
    });
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
              onPress={() => onSetStatus(placement, done ? 'planned' : 'done')}
              color={accentDark}
            />
            <ActionButton
              text="Move to"
              a11yLabel={`Move ${label}`}
              onPress={() => onMoveTo(placement)}
              color={accentDark}
            />
            {!done && (
              <ActionButton
                text="Skip"
                a11yLabel={`Skip ${label}`}
                onPress={() => onSetStatus(placement, 'skipped')}
                color={accentDark}
              />
            )}
            {done && showLogIt && (
              <TouchableOpacity
                ref={logItRef}
                onPress={handleLogIt}
                hitSlop={{ top: 6, bottom: 6 }}
                style={[styles.logItPill, { borderColor: accentDark }]}
                accessibilityRole="button"
                accessibilityLabel={`Log it: log a Vibe for ${label}`}
              >
                <Text style={styles.logItText}>Log it</Text>
              </TouchableOpacity>
            )}
          </>
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
  logItPill: {
    minHeight: 32, justifyContent: 'center',
    paddingHorizontal: 12, borderRadius: 16, borderWidth: 1,
    backgroundColor: withAlpha(C.amberBg, 0.25), marginLeft: 2,
  },
  logItText: { fontSize: 12, fontWeight: '700', color: C.text },
});
