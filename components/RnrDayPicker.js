import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { C, accentFor, darken, textOn } from '../lib/theme';
import { localDateString, parseLocalDateString, toLocalDateString, DEFAULT_WEEK_START_DAY } from '../lib/week';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// "Another day..." for Move to: a small month grid like the Calendar's,
// in plain JS (no date-picker module). The tile's current day is shown
// but can't be picked; today is outlined. Close, Android Back and the
// dimmed area close it without moving anything. title: the heading;
// Move to leaves the default, the full page's calendar button passes
// "Pick a date".
export default function RnrDayPicker({ visible, currentDate, onPick, onClose, title = 'Move to another day' }) {
  const { profile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);
  const weekStartDay = profile?.week_start_day ?? DEFAULT_WEEK_START_DAY;
  const [view, setView] = useState(() => monthOf(currentDate));

  // Opens on the tile's own month each time.
  useEffect(() => {
    if (visible) setView(monthOf(currentDate));
  }, [visible, currentDate]);

  const { year, month } = view;
  const leadingBlanks = (new Date(year, month, 1).getDay() - weekStartDay + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const weekdayLabels = [...WEEKDAY_LABELS.slice(weekStartDay), ...WEEKDAY_LABELS.slice(0, weekStartDay)];
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = localDateString();

  function goToMonth(delta) {
    const d = new Date(year, month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheet}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <View style={styles.monthRow}>
            <TouchableOpacity
              onPress={() => goToMonth(-1)}
              style={styles.navButton}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={22} color={C.subtext} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity
              onPress={() => goToMonth(1)}
              style={styles.navButton}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={22} color={C.subtext} />
            </TouchableOpacity>
          </View>
          <View style={styles.weekdayRow} importantForAccessibility="no-hide-descendants">
            {weekdayLabels.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>{label}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`b${i}`} style={styles.cell} />;
              const dateStr = toLocalDateString(new Date(year, month, day));
              const isCurrent = dateStr === currentDate;
              const isToday = dateStr === today;
              const fullLabel = new Date(year, month, day).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              });
              return (
                <TouchableOpacity
                  key={dateStr}
                  style={styles.cell}
                  disabled={isCurrent}
                  onPress={() => onPick(dateStr)}
                  accessibilityRole="button"
                  accessibilityLabel={`${fullLabel}${isToday ? ', today' : ''}${isCurrent ? ', already here' : ''}`}
                  accessibilityState={{ disabled: isCurrent }}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      isToday && { borderColor: accentDark, borderWidth: 1.5 },
                      isCurrent && { backgroundColor: accentDark },
                    ]}
                  >
                    <Text style={[styles.dayText, isCurrent && { color: textOn(accentDark) }]}>{day}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.cancel}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function monthOf(dateStr) {
  const d = dateStr ? parseLocalDateString(dateStr) : new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  sheet: {
    width: '100%', maxWidth: 360,
    backgroundColor: C.card, borderRadius: 22, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  title: { fontSize: 16, fontWeight: '700', color: C.rustDark, marginBottom: 4 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 15, fontWeight: '700', color: C.rustDark },
  // The Calendar's weekday row and 7-column grid.
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayLabel: { width: '14.28%', textAlign: 'center', fontSize: 12, fontWeight: '600', color: C.subtext },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: '84%', aspectRatio: 1, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  dayText: { fontSize: 14, color: C.text },
  cancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: 14, fontWeight: '700', color: C.subtext },
});
