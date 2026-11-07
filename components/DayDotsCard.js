import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, darken } from '../lib/theme';

// Permanent Day Dots block on the "My Day" filtered view
// (app/(tabs)/feed.js), straight on the page -- no card around it. There
// is no time window: today's dot can be picked at any time of the local
// day and changed until local midnight. `phase` drives which of the 3
// states below is shown; the caller (feed.js) derives it on every screen
// focus from today's local date + whatever day_dots row (if any) exists
// for it, no timers here or there.
//
//   'open'     -- no row for today yet. Full accent-colour dots, tappable,
//                 "Skip today" shown.
//   'answered' -- today has a dot pick (selectedDotIndex). That dot is
//                 filled; the other 3 are accent-coloured outlines. Every
//                 dot stays tappable: another dot changes the pick, the
//                 chosen one does nothing. No footer, no Skip link.
//   'skipped'  -- today was skipped. All 4 dots are accent-coloured
//                 outlines, "Skipped for today" underneath, and every dot
//                 is still tappable -- a tap replaces the skip with that dot.
//
// Dots are intentionally unlabeled on screen with no stated meaning, all
// in the account's own accent colour -- this component doesn't know or
// care what any dot "means". 4 distinct sizes, the actual visual
// mechanic, not a cosmetic choice. TalkBack only gets their position.
const DOT_SIZES = [14, 18, 22, 26];
const DOT_A11Y_SIZE_WORDS = ['smallest', 'small', 'large', 'largest'];

export default function DayDotsCard({ accentColor, phase, selectedDotIndex, onSelectDot, onSkip }) {
  const dotBorder = darken(accentColor, 0.15);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Dot your day</Text>

      <View style={styles.dotRow}>
        {DOT_SIZES.map((size, i) => {
          const isChosen = phase === 'answered' && selectedDotIndex === i;
          const showFill = phase === 'open' || isChosen;
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.dot,
                {
                  width: size, height: size, borderRadius: size / 2,
                  backgroundColor: showFill ? accentColor : 'transparent',
                  borderColor: dotBorder,
                },
              ]}
              onPress={() => onSelectDot(i)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`Day Dot ${i + 1} of ${DOT_SIZES.length}, ${DOT_A11Y_SIZE_WORDS[i]}`}
              accessibilityState={{ selected: isChosen }}
            />
          );
        })}
      </View>

      {phase === 'open' && (
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.footerText}>Skip today</Text>
        </TouchableOpacity>
      )}
      {phase === 'skipped' && <Text style={styles.footerText}>Skipped for today</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  // No card: straight on the page, centred, with a little room above
  // (the filter chips) and below (the first Tickle).
  wrap: { alignItems: 'center', marginTop: 4, marginBottom: 12 },
  heading: { fontSize: 15, fontWeight: '700', color: C.text },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6, marginBottom: 6 },
  dot: { borderWidth: 1.5 },
  // Shared by both footer messages (Skip today / Skipped for today) --
  // same slot, same typography.
  footerText: { fontSize: 13, color: C.subtext, fontWeight: '600' },
});
