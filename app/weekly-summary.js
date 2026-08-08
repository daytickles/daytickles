import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, moodColorFor, moodDotSize, textOn, TICKLE_NATURE_ICONS, NATURE_ORDER } from '../lib/theme';
import { currentWeekStartDate, currentWeekStartISO, localDateString, DEFAULT_WEEK_START_DAY } from '../lib/week';
import { initPinBoardDb, getPinnedPhotoCountSince, getPhotoShareCountSince } from '../lib/pinBoardDb';

// "Most liked" below is a distinct concept from the calendar-week stats
// above it -- a trailing window from today, not tied to week_start_day,
// same shape as Home's own 14-day pinned card (PINNED_WINDOW_DAYS)
// just scoped to 7 instead.
const TRAILING_WINDOW_DAYS = 7;

function formatWeekRange(weekStartDate) {
  // No 'Z'/timeZone override, unlike entry_date's display formatter --
  // weekStartDate is already a local calendar-date string computed on
  // this device, so it should be read back as local, not re-interpreted
  // through UTC.
  const start = new Date(`${weekStartDate}T00:00:00`);
  const end = new Date();
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Builds one warm sentence out of whichever connection stats are
// actually nonzero this week, rather than a stat grid -- and rather
// than an awkward "gave 0 likes, gained 0 followers" sentence when
// nothing happened, returns null so the whole section can be skipped.
function buildConnectionSentence({ likesGiven, newFollowers, thoughtOfYouSends }) {
  const clauses = [];
  if (likesGiven > 0) clauses.push(`gave ${likesGiven} ${likesGiven === 1 ? 'like' : 'likes'}`);
  if (newFollowers > 0) clauses.push(`gained ${newFollowers} new ${newFollowers === 1 ? 'follower' : 'followers'}`);
  if (thoughtOfYouSends > 0) {
    clauses.push(`thought of someone ${thoughtOfYouSends} ${thoughtOfYouSends === 1 ? 'time' : 'times'}`);
  }
  if (clauses.length === 0) return null;
  if (clauses.length === 1) return `You ${clauses[0]} this week.`;
  if (clauses.length === 2) return `You ${clauses[0]} and ${clauses[1]} this week.`;
  return `You ${clauses[0]}, ${clauses[1]}, and ${clauses[2]} this week.`;
}

export default function WeeklySummary() {
  const { session, profile } = useAuth();
  const accent = accentFor(profile?.accent_theme);
  const weekStartDay = profile?.week_start_day ?? DEFAULT_WEEK_START_DAY;

  const [loading, setLoading] = useState(true);
  const [weekEntries, setWeekEntries] = useState([]);
  const [mostLiked, setMostLiked] = useState(null);
  const [goals, setGoals] = useState([]);
  const [likesGiven, setLikesGiven] = useState(0);
  const [newFollowers, setNewFollowers] = useState(0);
  const [thoughtOfYouSends, setThoughtOfYouSends] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);

  const weekStartDate = currentWeekStartDate(weekStartDay);

  const loadSummary = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const weekStartISO = currentWeekStartISO(weekStartDay);
    const trailingCutoff = localDateString(TRAILING_WINDOW_DAYS - 1);

    await initPinBoardDb(session.user.id);

    const [
      weekEntriesResult,
      trailingEntriesResult,
      goalsResult,
      likesGivenResult,
      followersResult,
      sharesResult,
      photoShareCount,
      pinnedPhotoCount,
    ] = await Promise.all([
      supabase
        .from('tickle_entries')
        .select('id, entry_date, text_content, like_count, tickle_nature, goal_id')
        .eq('user_id', session.user.id)
        .gte('entry_date', weekStartDate),
      supabase
        .from('tickle_entries')
        .select('id, text_content, like_count, mood')
        .eq('user_id', session.user.id)
        .gte('entry_date', trailingCutoff),
      supabase.from('goals').select('*').order('created_at', { ascending: true }),
      supabase
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('created_at', weekStartISO),
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('followee_id', session.user.id)
        .gte('created_at', weekStartISO),
      supabase
        .from('tickle_shares')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', session.user.id)
        .eq('caption', 'thought_of_you')
        .gte('created_at', weekStartISO),
      getPhotoShareCountSince(session.user.id, weekStartISO, 'thought_of_you'),
      getPinnedPhotoCountSince(session.user.id, weekStartDate),
    ]);

    if (!weekEntriesResult.error) setWeekEntries(weekEntriesResult.data || []);

    if (!trailingEntriesResult.error) {
      const best = (trailingEntriesResult.data || []).reduce(
        (b, e) => (!b || e.like_count > b.like_count ? e : b),
        null
      );
      setMostLiked(best);
    }

    if (!goalsResult.error) setGoals(goalsResult.data || []);
    if (!likesGivenResult.error) setLikesGiven(likesGivenResult.count || 0);
    if (!followersResult.error) setNewFollowers(followersResult.count || 0);

    const cloudShares = sharesResult.error ? 0 : (sharesResult.count || 0);
    setThoughtOfYouSends(cloudShares + (photoShareCount || 0));

    setPhotoCount(pinnedPhotoCount || 0);
    setLoading(false);
  }, [session, weekStartDay, weekStartDate]);

  useFocusEffect(
    useCallback(() => {
      loadSummary();
    }, [loadSummary])
  );

  const weeklyTickles = weekEntries.length;
  const natureCounts = {
    received: weekEntries.filter((e) => e.tickle_nature === 'received').length,
    given: weekEntries.filter((e) => e.tickle_nature === 'given').length,
    self: weekEntries.filter((e) => e.tickle_nature === 'self').length,
  };
  const hasVibes = natureCounts.received > 0 || natureCounts.given > 0 || natureCounts.self > 0;

  const activeGoals = goals.filter((g) => !g.achieved_at);
  const achievedThisWeek = goals.filter((g) => g.achieved_at && g.achieved_at >= currentWeekStartISO(weekStartDay));
  const goalProgress = activeGoals
    .map((goal) => ({ goal, count: weekEntries.filter((e) => e.goal_id === goal.id).length }))
    .filter(({ count }) => count > 0);

  const connectionSentence = buildConnectionSentence({ likesGiven, newFollowers, thoughtOfYouSends });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Weekly Summary</Text>
        <Text style={styles.weekRange}>{formatWeekRange(weekStartDate)}</Text>

        {loading ? (
          <ActivityIndicator color={C.rust} style={styles.loader} />
        ) : (
          <>
            <View style={[styles.heroCard, { backgroundColor: accent.card }]}>
              <Text style={[styles.heroNumber, { color: textOn(accent.card) }]}>{weeklyTickles}</Text>
              <Text style={[styles.heroLabel, { color: textOn(accent.card) }]}>
                {weeklyTickles === 1 ? 'Tickle' : 'Tickles'} this week
              </Text>
            </View>

            {mostLiked && (
              <>
                <Text style={styles.sectionLabel}>Most liked this week</Text>
                <TouchableOpacity
                  style={styles.entryCard}
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push({ pathname: '/feed', params: { tab: 'mine', highlightEntry: mostLiked.id } })
                  }
                >
                  <View style={styles.entryRow}>
                    <View
                      style={[
                        styles.moodDot,
                        {
                          width: moodDotSize(mostLiked.mood),
                          height: moodDotSize(mostLiked.mood),
                          borderRadius: moodDotSize(mostLiked.mood) / 2,
                          backgroundColor: moodColorFor(mostLiked.mood, accent),
                        },
                      ]}
                    />
                    <View style={styles.entryBody}>
                      <Text style={styles.entryText} numberOfLines={2}>{mostLiked.text_content}</Text>
                      <Text style={styles.entryLikes}>
                        {mostLiked.like_count} {mostLiked.like_count === 1 ? 'like' : 'likes'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </>
            )}

            {hasVibes && (
              <>
                <Text style={styles.sectionLabel}>Weekly Vibes</Text>
                <View style={styles.vibesRow}>
                  {NATURE_ORDER.map((key) => (
                    <View key={key} style={styles.vibesBadge}>
                      <Ionicons name={TICKLE_NATURE_ICONS[key]} size={16} color={C.subtext} />
                      <Text style={styles.vibesCount}>{natureCounts[key]}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {(achievedThisWeek.length > 0 || goalProgress.length > 0) && (
              <>
                <Text style={styles.sectionLabel}>Goals</Text>
                {achievedThisWeek.map((g) => (
                  <View key={g.id} style={styles.goalRow}>
                    <View style={[styles.goalDot, { backgroundColor: g.color }]} />
                    <Text style={styles.goalText}>🎉 Achieved "{g.label}" this week</Text>
                  </View>
                ))}
                {goalProgress.map(({ goal, count }) => (
                  <View key={goal.id} style={styles.goalRow}>
                    <View style={[styles.goalDot, { backgroundColor: goal.color }]} />
                    <Text style={styles.goalText}>
                      {count} {count === 1 ? 'tickle' : 'tickles'} toward "{goal.label}"
                    </Text>
                  </View>
                ))}
              </>
            )}

            {connectionSentence && (
              <>
                <Text style={styles.sectionLabel}>Connection</Text>
                <Text style={styles.connectionText}>{connectionSentence}</Text>
              </>
            )}

            {photoCount > 0 && (
              <>
                <Text style={styles.sectionLabel}>Tickle Pics</Text>
                <Text style={styles.connectionText}>
                  You added {photoCount} {photoCount === 1 ? 'photo' : 'photos'} to your Tickle Pics this week.
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  weekRange: { fontSize: 13, color: C.subtext, marginTop: 2, marginBottom: 20 },
  loader: { marginTop: 40 },

  heroCard: { borderRadius: 20, paddingVertical: 24, alignItems: 'center', marginBottom: 24 },
  heroNumber: { fontSize: 40, fontWeight: 'bold' },
  heroLabel: { fontSize: 14, marginTop: 4 },

  sectionLabel: { fontSize: 14, fontWeight: '600', color: C.subtext, marginTop: 8, marginBottom: 8 },

  entryCard: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 16 },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  moodDot: { marginRight: 12, marginTop: 4 },
  entryBody: { flex: 1 },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },
  entryLikes: { fontSize: 12, color: C.teal, fontWeight: '600', marginTop: 6 },

  vibesRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  vibesBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingVertical: 10,
  },
  vibesCount: { fontSize: 13, fontWeight: '600', color: C.text },

  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  goalDot: { width: 10, height: 10, borderRadius: 5 },
  goalText: { flex: 1, fontSize: 14, color: C.text },

  connectionText: { fontSize: 14, color: C.text, lineHeight: 20, marginBottom: 16 },
});
