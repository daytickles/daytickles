// components/NailedItRow.js
//
// One "Nailed it!" tap (a goal_logs row) as a post on its Goal's screen
// (app/goal.js), in the same look and layout as a Quick Tickle post
// (components/EntryCard.js, the isQuick branch and its quick* styles --
// values copied, nothing imported from there): no card, a dusk badge pill
// with a "QG" disc and "Nailed it!", and the date · time line under it.
// No Goal dot (every post on that screen is the Goal's own), no
// "Tickle it", no X, no menu, and not pressable -- a tap can't be edited
// or undone. One accessible element for the whole post.

import { View, Text, StyleSheet } from 'react-native';
import { C } from '../lib/theme';
import { toLocalDateString } from '../lib/week';

const BADGE_FILL = '#425762';
const BADGE_TEXT = '#FFF8EC';
const MARK_SIZE = 20;
const MAX_FONT_SCALE = 1.6;

// The same two helpers EntryCard.js uses for the Quick Tickle row (not
// exported there, so copied): "Nov 1" for this year, "Nov 1, 2025"
// otherwise; and "9:14 AM" in the phone's own locale and time zone.
function formatEntryDate(entryDate, { dropCurrentYear = false } = {}) {
  const sameYear = dropCurrentYear && Number(String(entryDate).slice(0, 4)) === new Date().getFullYear();
  return new Date(`${entryDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

function formatEntryTime(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// log is a goal_logs row ({ id, created_at }); spacing is the gap below
// it, the same as the screen's Tickle cards.
export default function NailedItRow({ log, spacing = 12 }) {
  const when = new Date(log.created_at);
  // The tap's local calendar day, like a Tickle's entry_date.
  const dateText = Number.isNaN(when.getTime())
    ? ''
    : formatEntryDate(toLocalDateString(when), { dropCurrentYear: true });
  const timeText = formatEntryTime(log.created_at);
  const spoken = ['Nailed it', dateText, timeText].filter(Boolean).join(', ');

  return (
    <View style={[styles.row, { marginBottom: spacing }]}>
      <View style={styles.main} accessible accessibilityLabel={spoken}>
        <View style={styles.badge}>
          <View style={styles.mark}>
            <Text style={styles.markText} maxFontSizeMultiplier={MAX_FONT_SCALE}>QG</Text>
          </View>
          <Text style={styles.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>Nailed it!</Text>
        </View>
        <View style={styles.whenRow}>
          <Text style={styles.when} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {timeText ? `${dateText} · ${timeText}` : dateText}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // EntryCard's quickRowCard, without fill, border or shadow.
  row: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4,
    minHeight: 52, paddingVertical: 3, paddingHorizontal: 4, borderRadius: 14,
  },
  // EntryCard's quickRowMain.
  main: { flexGrow: 1, flexShrink: 0, maxWidth: '100%', minWidth: 0 },
  // EntryCard's quickBadge, in dusk.
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', maxWidth: '100%',
    minHeight: 28, borderRadius: 14, paddingLeft: 4, paddingRight: 12, backgroundColor: BADGE_FILL,
  },
  // EntryCard's quickBadgeMark.
  mark: {
    width: MARK_SIZE, height: MARK_SIZE, borderRadius: MARK_SIZE / 2,
    backgroundColor: 'rgba(255,248,236,0.22)', alignItems: 'center', justifyContent: 'center',
  },
  markText: { fontSize: 9, fontWeight: '700', color: BADGE_TEXT },
  label: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: BADGE_TEXT },
  // EntryCard's quickWhenRow and quickRowWhen.
  whenRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginLeft: 4 },
  when: { flexShrink: 1, fontSize: 12, lineHeight: 16, color: C.subtext },
});
