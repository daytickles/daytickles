// components/TrackerControl.js
//
// The rating controls for a private tracker (lib/trackers.js), used on
// the Your trackers page and in the New tracker screen's preview, plus
// the 7-day mini trail. One colour throughout (the caller's color, the
// user's darker accent): a rating is never judged by colour, praised or
// commented on.
//
// TrackerControl props: tracker ({ name, method, unit }), value (number
// or null = not rated), onChange(nextValueOrNull), color.
//   words  -- five chips; tapping the chosen one again clears it
//   scale  -- eleven segments 0..10 of growing height; tapping the chosen
//             one again clears it; the chosen one shows its number
//   amount -- minus, the number with the unit, plus (step 1); tap the
//             number to type one; Clear when rated; "Not rated" until
//             first used
import { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, textOn, withAlpha } from '../lib/theme';
import {
  TRACKER_WORDS, SCALE_MAX, ratingLabel, clampAmount, formatAmount,
} from '../lib/trackers';
import { localDateString, parseLocalDateString } from '../lib/week';

const TARGET = 44;

function WordsControl({ tracker, value, onChange, color }) {
  return (
    <View style={styles.chips}>
      {TRACKER_WORDS.map((word, i) => {
        const selected = value === i;
        return (
          <TouchableOpacity
            key={word}
            style={[styles.chip, selected ? { backgroundColor: color, borderColor: color } : { borderColor: withAlpha(color, 0.45) }]}
            onPress={() => onChange(selected ? null : i)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tracker.name}: ${word}${selected ? ', chosen. Tap again to clear' : ''}`}
          >
            <Text style={[styles.chipText, { color: selected ? textOn(color) : C.text }]}>{word}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ScaleControl({ tracker, value, onChange, color }) {
  return (
    <View style={styles.scaleRow}>
      {Array.from({ length: SCALE_MAX + 1 }, (_, n) => {
        const selected = value === n;
        return (
          <TouchableOpacity
            key={n}
            style={styles.scaleTarget}
            onPress={() => onChange(selected ? null : n)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tracker.name}: ${n} out of ${SCALE_MAX}${selected ? ', chosen. Tap again to clear' : ''}`}
          >
            <Text style={[styles.scaleNumber, { color, opacity: selected ? 1 : 0 }]}>{n}</Text>
            <View
              style={[
                styles.scaleBar,
                { height: 10 + n * 3, backgroundColor: selected ? color : withAlpha(color, 0.18) },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function AmountControl({ tracker, value, onChange, color }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Set by the first finishTyping (Done, or the blur after it), so the
  // second one doesn't save the same amount again.
  const finished = useRef(false);

  function step(delta) {
    const base = value == null ? (delta > 0 ? 0 : 1) : value;
    onChange(clampAmount(base + delta));
  }

  function startTyping() {
    setDraft(value == null ? '' : formatAmount(value));
    finished.current = false;
    setEditing(true);
  }

  // Empty or not a number: no change. Runs once per typing.
  function finishTyping() {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const text = draft.replace(',', '.').trim();
    if (!text) return;
    const next = clampAmount(Number(text));
    if (next != null && next !== value) onChange(next);
  }

  const shown = ratingLabel(tracker, value);
  return (
    <View>
      <View style={styles.amountRow}>
        <TouchableOpacity
          style={[styles.stepButton, { borderColor: withAlpha(color, 0.45) }]}
          onPress={() => step(-1)}
          disabled={value === 0}
          accessibilityRole="button"
          accessibilityLabel={`${tracker.name}: one less`}
        >
          <Ionicons name="remove" size={20} color={value === 0 ? C.faint : color} />
        </TouchableOpacity>
        {editing ? (
          <TextInput
            style={[styles.amountInput, { borderColor: color }]}
            value={draft}
            onChangeText={setDraft}
            onBlur={finishTyping}
            onSubmitEditing={finishTyping}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            maxLength={9}
            accessibilityLabel={`${tracker.name}: type an amount`}
          />
        ) : (
          <TouchableOpacity
            style={styles.amountValue}
            onPress={startTyping}
            accessibilityRole="button"
            accessibilityLabel={`${tracker.name}: ${shown}. Tap to type an amount`}
          >
            <Text style={[styles.amountText, value == null && styles.notRated]} numberOfLines={1}>{shown}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.stepButton, { borderColor: withAlpha(color, 0.45) }]}
          onPress={() => step(1)}
          accessibilityRole="button"
          accessibilityLabel={`${tracker.name}: one more`}
        >
          <Ionicons name="add" size={20} color={color} />
        </TouchableOpacity>
      </View>
      {value != null && !editing && (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityLabel={`${tracker.name}: clear today's amount`}
        >
          <Text style={[styles.clearText, { color }]}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function TrackerControl(props) {
  if (props.tracker.method === 'words') return <WordsControl {...props} />;
  if (props.tracker.method === 'scale') return <ScaleControl {...props} />;
  return <AmountControl {...props} />;
}

// Today and the count - 1 days before, oldest first.
function lastDays(count) {
  return Array.from({ length: count }, (_, i) => localDateString(count - 1 - i));
}

// How full a bar is (0..1) for a value: words out of 4, scale out of 10,
// an amount against the largest amount shown.
function fraction(tracker, value, amountMax) {
  if (tracker.method === 'words') return value / (TRACKER_WORDS.length - 1);
  if (tracker.method === 'scale') return value / SCALE_MAX;
  return amountMax > 0 ? value / amountMax : 0;
}

const TRAIL_MAX = 28;
const TRAIL_MIN = 4;

// The mini trail: one bar per day for the last dayCount days (7 unless
// given), oldest left, today right, one colour, taller = more; a day not
// rated is a short dashed outline; today is outlined. Read out in words
// for TalkBack. More than 7 days: thinner bars that share the width
// (30 fit at 320dp).
export function TrackerTrail({ tracker, ratings, color, dayCount = 7 }) {
  const days = lastDays(dayCount);
  const narrow = dayCount > 7;
  const values = days.map((d) => (ratings && ratings.has(d) ? ratings.get(d) : null));
  const amountMax = Math.max(0, ...values.filter((v) => v != null));
  const spoken = days.map((d, i) => {
    const name = i === days.length - 1
      ? 'today'
      : parseLocalDateString(d).toLocaleDateString('en-GB', { weekday: 'long' });
    return `${name} ${ratingLabel(tracker, values[i])}`;
  }).join(', ');

  return (
    <View style={[styles.trail, narrow && styles.trailNarrow]} accessible accessibilityLabel={`Last ${dayCount} days: ${spoken}`}>
      {values.map((v, i) => {
        const isToday = i === days.length - 1;
        if (v == null) {
          return (
            <View key={days[i]} style={[styles.trailSlot, narrow && styles.trailSlotNarrow]}>
              <View style={[styles.trailEmpty, { borderColor: withAlpha(color, isToday ? 0.9 : 0.45) }]} />
            </View>
          );
        }
        const h = Math.max(TRAIL_MIN, Math.round(fraction(tracker, v, amountMax) * TRAIL_MAX));
        return (
          <View key={days[i]} style={[styles.trailSlot, narrow && styles.trailSlotNarrow]}>
            <View
              style={[
                styles.trailBar,
                { height: h, backgroundColor: color },
                isToday && { borderWidth: 2, borderColor: C.text },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TARGET, paddingHorizontal: 14, borderRadius: TARGET / 2, borderWidth: 1,
    justifyContent: 'center', backgroundColor: C.card,
  },
  chipText: { fontSize: 14, fontWeight: '600' },

  scaleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  scaleTarget: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 1 },
  scaleNumber: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  scaleBar: { width: '80%', borderRadius: 3 },

  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: {
    width: TARGET, height: TARGET, borderRadius: TARGET / 2, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.card,
  },
  amountValue: { flex: 1, minHeight: TARGET, justifyContent: 'center', alignItems: 'center' },
  amountText: { fontSize: 18, fontWeight: '700', color: C.text },
  notRated: { fontSize: 15, fontWeight: '400', color: C.subtext },
  amountInput: {
    flex: 1, minHeight: TARGET, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10,
    fontSize: 18, textAlign: 'center', color: C.text, backgroundColor: C.card,
  },
  clearButton: { alignSelf: 'center', minHeight: TARGET, paddingHorizontal: 16, justifyContent: 'center' },
  clearText: { fontSize: 14, fontWeight: '600' },

  trail: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: TRAIL_MAX, marginTop: 12 },
  trailSlot: { width: 18, height: TRAIL_MAX, justifyContent: 'flex-end' },
  trailNarrow: { gap: 2 },
  trailSlotNarrow: { width: undefined, flex: 1 },
  trailBar: { width: '100%', borderRadius: 3 },
  trailEmpty: { width: '100%', height: 6, borderRadius: 2, borderWidth: 1, borderStyle: 'dashed' },
});
