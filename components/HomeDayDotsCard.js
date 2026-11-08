import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Animated, AccessibilityInfo } from 'react-native';
import { DECK_TEXT } from './HomeDeck';
import { parseLocalDateString } from '../lib/week';
import { DAY_DOT_COUNT } from '../lib/dayDots';

// Home's Day Dots deck card: today's dot as one big hero, and a trail of
// the last 5 days under it. Replaces the old "Dot your day" picker on My
// Day (the deleted components/DayDotsCard.js); the reads and writes are
// lib/dayDots.js, and home.js owns the state (today's phase, the trail
// rows) and the save.
//
// Today's phase, as before: 'open' (no row yet), 'answered' (dotIndex
// 0..3) or 'skipped'. Dots still have no stated meaning -- only 4 sizes.
//
//   tap        not dotted / skipped -> size 1; otherwise one size up,
//              wrapping from size 4 back to size 1. Saves at once.
//   TalkBack   adjustable: increment / decrement save at once, no wrap.

// Hero dot sizes (dp) for dot_index 0..3, and the not-dotted / skipped
// rings. The Pressable is HERO_BOX square plus HERO_HIT_SLOP all round:
// a 100 x 100dp touch target that only takes 92dp of the card's height.
const HERO_SIZES = [44, 60, 76, 92];
const HERO_OPEN_SIZE = 60;
const HERO_SKIPPED_SIZE = 44;
const HERO_BOX = 92;
const HERO_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };
// Trail bead sizes (dp) for dot_index 0..3, and the other bead kinds.
const BEAD_SIZES = [10, 14, 18, 22];
const BEAD_SKIPPED_SIZE = 12;
const BEAD_TODAY_OPEN_SIZE = 16;
const BEAD_EMPTY_SIZE = 5;
const BEAD_ROW_HEIGHT = 22;

// Dotted fill and ring at full strength (the biggest size).
const DOT_FILL = '#FFF8EC';
const DOT_RING = '#E6CFAE';
// Brightness by size, for dot_index 0..3: the smallest dimmest, the
// biggest full cream. Used on the hero and the trail's dotted beads.
const DOT_ALPHAS = [0.5, 0.68, 0.84, 1];

// '#RRGGBB' -> [r, g, b], or null.
function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// colorHex at `alpha` over the card colour, worked out as one SOLID
// colour: it looks the same as the see-through colour on the card, but
// nothing behind the dot (the trail line, the corner circle) can show
// through. alpha 1 gives colorHex itself. Falls back to plain rgba if
// the card colour isn't '#RRGGBB'.
function fadedOnCard(colorHex, alpha, cardColor) {
  if (alpha >= 1) return colorHex;
  const fg = hexRgb(colorHex);
  const bg = hexRgb(cardColor);
  if (!fg) return colorHex;
  if (!bg) return `rgba(${fg[0]},${fg[1]},${fg[2]},${alpha})`;
  const ch = (i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha));
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

// Fill and ring colours for a dotted dot of this size.
function dotColors(index, cardColor) {
  const a = DOT_ALPHAS[index] ?? DOT_ALPHAS[0];
  return {
    backgroundColor: fadedOnCard(DOT_FILL, a, cardColor),
    borderColor: fadedOnCard(DOT_RING, a, cardColor),
  };
}
const cream = (a) => `rgba(255,248,236,${a})`;
// Labels may scale with the font size, but not so far that "Today"
// outgrows its fifth of the trail or "Skipped" its hero box.
const TRAIL_LABEL_MAX_SCALE = 1.6;
const HERO_LABEL_MAX_SCALE = 1.3;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduceMotion(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduceMotion;
}

// The card's sub line, by today's phase.
export function dayDotsSubLine(phase) {
  if (phase === 'skipped') return 'Skipped today. Tap the dot to set it.';
  return 'Tap the dot: bigger is brighter';
}

// The header's Skip pill. Filled while today is skipped. Skip is an
// insert (lib/dayDots.js skipDayDot), so it only works while today has
// no row: once today is dotted it's disabled (dimmed).
export function DayDotsSkipPill({ phase, onPress }) {
  const skipped = phase === 'skipped';
  const disabled = phase !== 'open';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.skipPill, skipped && styles.skipPillOn, phase === 'answered' && styles.skipPillDisabled]}
      hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Skip today"
      accessibilityState={{ selected: skipped, disabled }}
    >
      <Text style={styles.skipPillText} numberOfLines={1}>Skip</Text>
    </TouchableOpacity>
  );
}

function sizeWords(index) {
  return `Size ${index + 1} of ${DAY_DOT_COUNT}`;
}

// trail: [{ date, row }] oldest first, today last (row: the day_dots row
// or undefined), or null when the read failed -- then only the hero shows.
// onSave(dotIndex) saves today's dot (home.js: optimistic, puts it back
// and says so on failure).
export default function HomeDayDotsCard({ phase, dotIndex, trail, cardColor, onSave }) {
  const reduceMotion = useReduceMotion();

  const shownIndex = phase === 'answered' ? dotIndex : null;
  const dotted = shownIndex != null;
  const targetSize = dotted ? HERO_SIZES[shownIndex] : phase === 'skipped' ? HERO_SKIPPED_SIZE : HERO_OPEN_SIZE;
  const size = useRef(new Animated.Value(targetSize)).current;

  useEffect(() => {
    if (reduceMotion) {
      size.stopAnimation();
      size.setValue(targetSize);
      return;
    }
    // Width and height can't use the native driver. speed/bounciness
    // settle in about 250ms.
    Animated.spring(size, { toValue: targetSize, speed: 22, bounciness: 5, useNativeDriver: false }).start();
  }, [targetSize, reduceMotion, size]);

  function handlePress() {
    onSave(phase === 'answered' ? (dotIndex + 1) % DAY_DOT_COUNT : 0);
  }

  function handleA11yAction(e) {
    const name = e.nativeEvent.actionName;
    if (name === 'increment') {
      if (phase !== 'answered') onSave(0);
      else if (dotIndex < DAY_DOT_COUNT - 1) onSave(dotIndex + 1);
    } else if (name === 'decrement') {
      if (phase === 'answered' && dotIndex > 0) onSave(dotIndex - 1);
    }
  }

  const stateWords = phase === 'answered' ? sizeWords(dotIndex) : phase === 'skipped' ? 'Skipped' : 'Not dotted yet';
  const heroLabel = `Today's dot. ${stateWords}. Bigger is brighter. Tap to step up the size.`;

  const sizeStyle = { width: size, height: size, borderRadius: Animated.divide(size, 2) };
  let ringStyle;
  if (dotted) ringStyle = [styles.heroDotted, dotColors(shownIndex, cardColor)];
  else if (phase === 'skipped') ringStyle = styles.heroSkipped;
  else ringStyle = styles.heroOpen;
  const heroText = dotted ? null : phase === 'skipped' ? 'Skipped' : 'Tap';

  return (
    <View style={styles.body}>
      <Pressable
        style={styles.heroBox}
        hitSlop={HERO_HIT_SLOP}
        onPress={handlePress}
        accessibilityRole="adjustable"
        accessibilityLabel={heroLabel}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleA11yAction}
      >
        <Animated.View style={[ringStyle, sizeStyle]} />
        {!!heroText && (
          <View style={styles.heroTextWrap} pointerEvents="none">
            <Text style={styles.heroText} maxFontSizeMultiplier={HERO_LABEL_MAX_SCALE}>{heroText}</Text>
          </View>
        )}
      </Pressable>

      {!!trail && <Trail trail={trail} todayPhase={phase} todayIndex={shownIndex} cardColor={cardColor} />}
    </View>
  );
}

// Thin line behind 5 beads, oldest left, today right, each with its
// weekday under it. One TalkBack label for the lot.
function Trail({ trail, todayPhase, todayIndex, cardColor }) {
  const last = trail.length - 1;
  const days = trail.map((d, i) => {
    const isToday = i === last;
    const wd = parseLocalDateString(d.date).getDay();
    let kind;
    let index = null;
    if (isToday) {
      if (todayIndex != null) { kind = 'dot'; index = todayIndex; }
      else kind = todayPhase === 'skipped' ? 'skipped' : 'todayOpen';
    } else if (!d.row) kind = 'empty';
    else if (d.row.status === 'answered') { kind = 'dot'; index = d.row.dot_index; }
    else kind = 'skipped';
    return { key: d.date, isToday, kind, index, short: isToday ? 'Today' : WEEKDAY_SHORT[wd], long: isToday ? 'Today' : WEEKDAY_LONG[wd] };
  });

  const a11y = `Last ${days.length} days: ` + days.map((d) => {
    const w = d.kind === 'dot' ? sizeWords(d.index).toLowerCase()
      : d.kind === 'skipped' ? 'skipped'
      : d.kind === 'todayOpen' ? 'not dotted yet'
      : 'no dot';
    return `${d.long}, ${w}`;
  }).join('; ') + '.';

  return (
    <View style={styles.trail} accessible accessibilityLabel={a11y}>
      <View style={styles.beadRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.trailLine} />
        {days.map((d) => (
          <View key={d.key} style={styles.beadCol}>
            <Bead kind={d.kind} index={d.index} cardColor={cardColor} />
          </View>
        ))}
      </View>
      <View style={styles.labelRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {days.map((d) => (
          <Text
            key={d.key}
            style={[styles.trailLabel, d.isToday && styles.trailLabelToday]}
            numberOfLines={1}
            maxFontSizeMultiplier={TRAIL_LABEL_MAX_SCALE}
          >
            {d.short}
          </Text>
        ))}
      </View>
    </View>
  );
}

// Rings get the card's own colour as their fill, so the trail line
// doesn't show through them. Dotted beads fade by size like the hero
// (dotColors, solid colours, so the line doesn't show through those
// either); today's bead uses today's size, so it matches the hero.
function Bead({ kind, index, cardColor }) {
  if (kind === 'dot') {
    const s = BEAD_SIZES[index] ?? BEAD_SIZES[0];
    return <View style={[styles.beadDot, dotColors(index, cardColor), { width: s, height: s, borderRadius: s / 2 }]} />;
  }
  if (kind === 'skipped') {
    return <View style={[styles.beadSkipped, { backgroundColor: cardColor }]} />;
  }
  if (kind === 'todayOpen') {
    return <View style={[styles.beadTodayOpen, { backgroundColor: cardColor }]} />;
  }
  return <View style={styles.beadEmpty} />;
}

const styles = StyleSheet.create({
  // Fills the card below the sub line; no scrolling (HomeDeck fixedBody).
  body: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly' },
  heroBox: { width: HERO_BOX, height: HERO_BOX, alignItems: 'center', justifyContent: 'center' },
  heroOpen: { borderWidth: 2, borderStyle: 'dashed', borderColor: cream(0.95) },
  heroSkipped: { borderWidth: 2, borderColor: cream(0.8) },
  heroDotted: { backgroundColor: DOT_FILL, borderWidth: 1.5, borderColor: DOT_RING },
  heroTextWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  heroText: { fontSize: 13, fontWeight: '700', color: DECK_TEXT },

  trail: { alignSelf: 'stretch' },
  beadRow: { height: BEAD_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center' },
  // From the first bead's centre to the last's: each bead sits in the
  // middle of its fifth.
  trailLine: {
    position: 'absolute', left: '10%', right: '10%',
    top: BEAD_ROW_HEIGHT / 2 - 0.5, height: 1, backgroundColor: cream(0.4),
  },
  beadCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  beadDot: { backgroundColor: DOT_FILL, borderWidth: 1.5, borderColor: DOT_RING },
  beadSkipped: {
    width: BEAD_SKIPPED_SIZE, height: BEAD_SKIPPED_SIZE, borderRadius: BEAD_SKIPPED_SIZE / 2,
    borderWidth: 1.5, borderColor: cream(0.8),
  },
  beadTodayOpen: {
    width: BEAD_TODAY_OPEN_SIZE, height: BEAD_TODAY_OPEN_SIZE, borderRadius: BEAD_TODAY_OPEN_SIZE / 2,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: cream(0.95),
  },
  beadEmpty: {
    width: BEAD_EMPTY_SIZE, height: BEAD_EMPTY_SIZE, borderRadius: BEAD_EMPTY_SIZE / 2,
    backgroundColor: cream(0.5),
  },
  labelRow: { flexDirection: 'row', marginTop: 2 },
  trailLabel: { flex: 1, textAlign: 'center', fontSize: 12, color: DECK_TEXT },
  trailLabelToday: { fontWeight: '700' },

  // Header Skip pill: about 24dp drawn (no taller than the title), 44dp
  // to tap with the hitSlop.
  skipPill: {
    flexShrink: 0, paddingHorizontal: 12, paddingVertical: 2, borderRadius: 12,
    borderWidth: 1.5, borderColor: cream(0.6),
  },
  skipPillOn: { backgroundColor: cream(0.28) },
  skipPillDisabled: { opacity: 0.45 },
  skipPillText: { fontSize: 13, fontWeight: '700', color: DECK_TEXT },
});
