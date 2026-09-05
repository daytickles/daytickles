import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, darken, withAlpha } from '../lib/theme';
import { EVENING_HOUR, EVENING_MINUTE } from '../lib/reminders';

// EVENING_HOUR/MINUTE are fixed constants, not per-render state -- this
// only needs computing once at module load, not inline in render, and
// stays in sync automatically if those constants ever change (never a
// hardcoded "8:00 PM" string).
const EVENING_TIME_LABEL = (() => {
  const d = new Date();
  d.setHours(EVENING_HOUR, EVENING_MINUTE, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
})();

// Permanent card on the "My Day" filtered view (app/(tabs)/feed.js) --
// no longer a fixed-window prompt that vanishes if unanswered (see
// project memory: the discarded open/close-timer design). `phase` drives
// which of the 4 states below is shown; the caller (feed.js) derives it
// fresh on every screen focus from today's local date + whatever
// day_dots row (if any) exists for it, no timers here or there.
//
//   'before'   -- not yet past EVENING_HOUR:EVENING_MINUTE locally today.
//                 Dots shown but inert (neutral outline, no fill),
//                 "Available after X" in place of the Skip link --
//                 nothing to skip yet.
//   'active'   -- past that time, today still unanswered. Full
//                 accent-color dots, tappable, "Skip today" shown.
//   'answered' -- today already has a dot pick (selectedDotIndex).
//                 That dot fully filled/highlighted; the other 3 render
//                 as accent-colored outlines (not neutral -- still the
//                 same dot set, just not the chosen one), nothing
//                 tappable, no Skip link.
//   'skipped'  -- today was explicitly skipped. All 4 dots render as
//                 accent-colored outlines (same non-chosen treatment as
//                 'answered', since none was chosen), "Skipped for
//                 today" text in place of the Skip link, nothing
//                 tappable.
//
// Dots are intentionally unlabeled with no stated meaning, all in the
// account's own accent color -- this component doesn't know or care
// what any dot "means". 4 distinct sizes (was 3) -- still the actual
// visual mechanic, not a cosmetic choice.
const DOT_SIZES = [22, 30, 38, 46];

export default function DayDotsCard({ accentColor, phase, selectedDotIndex, onSelectDot, onSkip, style }) {
  const dotBorder = darken(accentColor, 0.15);
  const interactive = phase === 'active';
  // 'before': neutral/faint outline -- reads as "nothing to do here
  // yet", unrelated to the account's own accent color. Distinct on
  // purpose from the accent-colored outline below so the two different
  // meanings (not open yet vs. already resolved, just not this slot)
  // don't look identical. C.subtext (not C.border) at a thicker 2.5px
  // ring -- C.border read as near-invisible against the wallpaper on a
  // real device screenshot (2026-09-06), too subtle to register as an
  // outline at all rather than "muted". C.subtext specifically (over
  // the also-considered C.faint) because it matches footerText's own
  // color below -- the outline and the "Available after X" caption
  // read as visually related rather than two different faint tones.
  const inertBorderColor = C.subtext;
  const inertBorderWidth = 2.5;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: withAlpha(accentColor, 0.14), borderColor: accentColor },
        style,
      ]}
    >
      <Text style={styles.heading}>Dot your Day</Text>

      <View style={styles.dotRow}>
        {DOT_SIZES.map((size, i) => {
          const isChosen = phase === 'answered' && selectedDotIndex === i;
          const showFill = phase === 'active' || isChosen;
          const borderColor = phase === 'before' ? inertBorderColor : dotBorder;
          const borderWidth = phase === 'before' ? inertBorderWidth : styles.dot.borderWidth;
          return (
            <TouchableOpacity
              key={i}
              disabled={!interactive}
              style={[
                styles.dot,
                {
                  width: size, height: size, borderRadius: size / 2,
                  backgroundColor: showFill ? accentColor : 'transparent',
                  borderColor,
                  borderWidth,
                },
              ]}
              onPress={() => interactive && onSelectDot(i)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            />
          );
        })}
      </View>

      {phase === 'before' && (
        <Text style={styles.footerText}>Available after {EVENING_TIME_LABEL}</Text>
      )}
      {phase === 'active' && (
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.footerText}>Skip today</Text>
        </TouchableOpacity>
      )}
      {phase === 'skipped' && <Text style={styles.footerText}>Skipped for today</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Light-wash + solid-border treatment, matching Weekly Summary's own
  // section cards (entryCard/goalCard/awardCard/connectionCard) rather
  // than a solid C.card fill -- this card's accent color is per-user
  // (accentColor prop), so the wash is computed inline below, not a
  // fixed color in this stylesheet.
  card: {
    borderRadius: 18, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12,
    alignItems: 'center',
  },
  heading: { fontSize: 15, fontWeight: '700', color: C.text },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10, marginBottom: 10 },
  dot: { borderWidth: 1.5 },
  // Shared by all 3 non-answered footer messages (Skip today / Skipped
  // for today / Available after X) -- same slot, same typography, so
  // the card's height/layout doesn't shift between phases.
  footerText: { fontSize: 13, color: C.subtext, fontWeight: '600' },
});
