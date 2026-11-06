// components/NotificationRow.js
//
// The Notifications screen's list pieces (Task 6, "one white sheet"):
// the wording for each notification, the day groups and short times, and
// the row / group-header items that together make one rounded white
// sheet inside a FlatList. The screen flattens its notifications into
// header and row items (buildNotificationItems); each item paints its own
// slice of the sheet (white, hairline side edges, the first item's top
// corners and the last item's bottom corners rounded), so the list stays
// virtualised and pull-to-refresh is unchanged.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, AWARD_TYPES, AWARD_HAND_ICON, AWARD_BADGE_COLOR, awardLabelFor, withAlpha } from '../lib/theme';
import { flagEmoji } from '../lib/country';
import { taleIconName } from '../lib/tales';
import { useHomePalette } from '../lib/homePalette';

// Any type without its own wording (or a row whose wording comes out
// empty) gets this line, so no row is ever blank.
export const FALLBACK_NOTIFICATION_TEXT = 'New activity on your Tickle';

const SHEET_RADIUS = 18;
const HEADER_BAND = '#FAF5EA';
const ICON_SIZE = 40;

// The type column is a Postgres check constraint ('like' | 'comment' |
// 'streak_milestone' | 'favorite' | 'award' | 'tale_chapter', see
// migration 0020 for favorite/award and 0067 for tale_chapter). Nothing
// creates 'comment' or 'streak_milestone' rows (no comments UI; the
// streak feature is retired), so they fall through to the fallback line.
// The who-did-what wording only: the Tickle's own text, which used to
// follow a colon on like / favourite / High Five rows, is now the row's
// second line (notificationBody) instead.
export function notificationTitle(n) {
  const flag = n.profiles?.country ? ` ${flagEmoji(n.profiles.country)}` : '';
  const actorName = n.profiles?.username ? `${n.profiles.username}${flag}` : 'Someone';
  let text;
  switch (n.type) {
    case 'like':
      text = `${actorName} liked your Tickle`;
      break;
    case 'favorite':
      text = `${actorName} favourited your Tickle`;
      break;
    // Names the preset (— "Epic!") via awardLabelFor; an unknown type
    // (e.g. one added by a newer build) just reads "a High Five".
    case 'award': {
      const awardLabel = awardLabelFor(n.award_type);
      text = `${actorName} gave you ${awardLabel ? `a High Five — "${awardLabel}"` : 'a High Five'}`;
      break;
    }
    // Migration 0067 -- one row per follower of a Tale, written by the
    // handle_tale_chapter_visible trigger when a chapter goes live.
    case 'tale_chapter':
      text = n.tales?.title
        ? `${actorName} added a new Tic to "${n.tales.title}"`
        : `${actorName} added a new Tic to a Blogbit you follow`;
      break;
    default:
      text = FALLBACK_NOTIFICATION_TEXT;
  }
  return text && text.trim() ? text : FALLBACK_NOTIFICATION_TEXT;
}

// The Tickle's first words, for the second line (null when there are none).
export function notificationBody(n) {
  const t = n.tickle_entries?.text_content;
  return t && t.trim() ? t.trim() : null;
}

// Icon and colour per type: High Five = its award's own colour; the rest
// from the chosen Home colour set's deck colours (`deck`, from
// lib/homePalette.js: like = Goals, favourite = Rewards, Blogbit =
// Blogbits). Unknown types get a plain bell in the subtext colour.
function notificationIcon(n, deck) {
  switch (n.type) {
    case 'award':
      return { kind: 'ion', name: AWARD_HAND_ICON, color: AWARD_TYPES[n.award_type]?.color || AWARD_BADGE_COLOR };
    case 'like':
      return { kind: 'ion', name: 'thumbs-up', color: deck.goals };
    case 'favorite':
      // The same ★ glyph the Tickle cards' star uses.
      return { kind: 'star', color: deck.rewards };
    case 'tale_chapter':
      return { kind: 'ion', name: taleIconName(n.tales?.icon), color: deck.multickles };
    default:
      return { kind: 'ion', name: 'notifications-outline', color: C.subtext };
  }
}

// Whole local calendar days between `date` and `now` (0 = today).
function localDayDiff(date, now) {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000);
}

function groupFor(dayDiff) {
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff <= 6) return 'Earlier this week';
  return 'Earlier';
}

// Short time shown on the row, and the same moment in words for the
// spoken label.
function timeTexts(createdAt, now) {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return { short: '', spoken: '' };
  const dayDiff = localDayDiff(d, now);
  if (dayDiff <= 0) {
    const mins = Math.floor((now - d) / 60000);
    if (mins < 1) return { short: 'now', spoken: 'just now' };
    if (mins < 60) return { short: `${mins}m`, spoken: `${mins} minute${mins === 1 ? '' : 's'} ago` };
    const hours = Math.floor(mins / 60);
    return { short: `${hours}h`, spoken: `${hours} hour${hours === 1 ? '' : 's'} ago` };
  }
  if (dayDiff === 1) {
    const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return { short: clock, spoken: `yesterday at ${clock}` };
  }
  if (dayDiff <= 6) {
    return {
      short: d.toLocaleDateString('en-US', { weekday: 'short' }),
      spoken: `on ${d.toLocaleDateString('en-US', { weekday: 'long' })}`,
    };
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return {
    short: d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }),
    spoken: `on ${d.toLocaleDateString('en-US', sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' })}`,
  };
}

// Newest-first notifications -> FlatList items: a header item before each
// non-empty day group, then its rows. first / last mark the sheet's top
// and bottom; afterHeader marks a row with no divider above it.
export function buildNotificationItems(notifications, now = new Date()) {
  const items = [];
  let currentGroup = null;
  for (const n of notifications) {
    const group = groupFor(localDayDiff(new Date(n.created_at), now));
    const afterHeader = group !== currentGroup;
    if (afterHeader) {
      items.push({ kind: 'header', key: `h-${group}`, label: group });
      currentGroup = group;
    }
    items.push({ kind: 'row', key: String(n.id), n, afterHeader, ...timeTexts(n.created_at, now) });
  }
  if (items.length) {
    items[0] = { ...items[0], first: true };
    items[items.length - 1] = { ...items[items.length - 1], last: true };
  }
  return items;
}

export function NotificationSheetHeader({ item }) {
  return (
    <View style={[styles.slice, styles.headerBand, item.first && styles.sliceFirst, item.last && styles.sliceLast]}>
      <Text style={styles.headerText} accessibilityRole="header">{item.label.toUpperCase()}</Text>
    </View>
  );
}

export function NotificationSheetRow({ item, onPress }) {
  const { n } = item;
  const unread = !n.is_read;
  const title = notificationTitle(n);
  const body = notificationBody(n);
  const { deck } = useHomePalette();
  const icon = notificationIcon(n, deck);
  const label = [title, unread ? 'unread' : 'read', item.spoken].filter(Boolean).join(', ');
  return (
    <TouchableOpacity
      onPress={() => onPress(n)}
      style={[
        styles.slice,
        styles.row,
        !item.afterHeader && styles.rowDivider,
        item.first && styles.sliceFirst,
        item.last && styles.sliceLast,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.dotColumn} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {unread && <View style={styles.dot} />}
      </View>
      <View style={[styles.iconCircle, { backgroundColor: withAlpha(icon.color, 0.14) }, !unread && styles.iconRead]}>
        {icon.kind === 'star' ? (
          <Text style={[styles.starGlyph, { color: icon.color }]} maxFontSizeMultiplier={1.2}>★</Text>
        ) : (
          <Ionicons name={icon.name} size={20} color={icon.color} />
        )}
      </View>
      <View style={styles.textColumn}>
        <View style={styles.firstLine}>
          <Text style={[styles.title, unread ? styles.titleUnread : styles.titleRead]}>{title}</Text>
          <Text style={styles.time}>{item.short}</Text>
        </View>
        {!!body && (
          <Text style={styles.body} numberOfLines={2}>{body}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // One slice of the white sheet: white, with hairline side edges so the
  // slices read as one sheet on the cream wallpaper.
  slice: {
    backgroundColor: C.card,
    borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  sliceFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: SHEET_RADIUS, borderTopRightRadius: SHEET_RADIUS,
  },
  sliceLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: SHEET_RADIUS, borderBottomRightRadius: SHEET_RADIUS,
  },
  headerBand: { backgroundColor: HEADER_BAND, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  headerText: { fontSize: 11, fontWeight: '700', color: C.subtext, letterSpacing: 0.6 },
  // minHeight, never a fixed height: rows grow with the text at large
  // font sizes. At least 64dp tall (40dp icon + padding), so well past 44dp.
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    minHeight: 64, paddingVertical: 12, paddingRight: 14, paddingLeft: 6,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  // Its own 10dp column so read and unread rows line up.
  dotColumn: { width: 10, height: ICON_SIZE, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal },
  iconCircle: {
    width: ICON_SIZE, height: ICON_SIZE, borderRadius: ICON_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  iconRead: { opacity: 0.75 },
  starGlyph: { fontSize: 20, lineHeight: 24 },
  textColumn: { flex: 1 },
  firstLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 14, lineHeight: 19 },
  titleUnread: { fontWeight: '700', color: C.rustDark },
  titleRead: { fontWeight: '600', color: C.subtext },
  time: { fontSize: 12, color: C.subtext, marginTop: 1 },
  body: { fontSize: 13, color: C.subtext, lineHeight: 18, marginTop: 3 },
});
