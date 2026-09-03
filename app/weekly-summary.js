import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, SAVED_ENTRY_DOT_SIZE, textOn, withAlpha, darken, lighten, NATURE_ORDER, VIBE_COLORS, AWARD_TYPES, AWARD_HAND_ICON } from '../lib/theme';
import { currentWeekStartDate, currentWeekStartISO, currentWeekDates, localDateString, DEFAULT_WEEK_START_DAY } from '../lib/week';
import { initPinBoardDb, getPinnedPhotoCountSince, getPhotoShareCountSince } from '../lib/pinBoardDb';
import { flagEmoji } from '../lib/country';
import WallpaperBackground from '../components/WallpaperBackground';
import NatureIcon from '../components/NatureIcon';

// "Most liked" below is a distinct concept from the calendar-week stats
// above it -- a trailing window from today, not tied to week_start_day,
// same shape as Home's own 14-day pinned card (PINNED_WINDOW_DAYS)
// just scoped to 7 instead.
const TRAILING_WINDOW_DAYS = 7;

// Mirrors lib/theme.js's/settings.js's own NATURE_LABELS -- received/
// given/self, in that order.
const NATURE_LABELS = {
  received: 'Made me smile',
  given: 'Paying forward',
  self: 'For me',
};

// Bubble grid sizing -- a filled bubble's diameter scales between these
// two values based on that cell's count relative to the grid's single
// largest cell (so relative sizing is meaningful across the whole
// week x vibe grid, not just within one row or one day). A genuine
// zero gets its own small fixed grey dot (BUBBLE_EMPTY) instead of a
// tiny/invisible bubble -- deliberately smaller than any filled
// bubble and never vibe-colored, so "present but empty" reads as
// visually distinct from an unrendered cell.
const BUBBLE_MIN = 12;
const BUBBLE_MAX = 26;
const BUBBLE_EMPTY = 6;

function bubbleDiameter(count, maxCellCount) {
  return BUBBLE_MIN + (count / maxCellCount) * (BUBBLE_MAX - BUBBLE_MIN);
}

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

// Same no-'Z' local-date convention as formatWeekRange -- date is
// already a local 'YYYY-MM-DD' string, read back as local.
function weekdayLabel(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
}

export default function WeeklySummary() {
  const { session, profile } = useAuth();
  const accent = accentFor(profile?.accent_theme);
  const weekStartDay = profile?.week_start_day ?? DEFAULT_WEEK_START_DAY;

  const [loading, setLoading] = useState(true);
  const [weekEntries, setWeekEntries] = useState([]);
  const [mostLiked, setMostLiked] = useState(null);
  const [goals, setGoals] = useState([]);
  // "Given" reads straight from awards (RLS already lets the giver read
  // their own rows). "Received" can't -- awards RLS is private to the
  // giver, so there's no policy letting a recipient query it directly --
  // sourced from notifications instead, which already stores award_type
  // per-row and already allows the recipient to read their own rows.
  const [awardsGiven, setAwardsGiven] = useState([]);
  const [awardsReceived, setAwardsReceived] = useState([]);
  const [likesGiven, setLikesGiven] = useState(0);
  const [newFollowers, setNewFollowers] = useState(0);
  const [thoughtOfYouSends, setThoughtOfYouSends] = useState(0);
  const [madeMeSmileSends, setMadeMeSmileSends] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [weeklySharesTotal, setWeeklySharesTotal] = useState(0);

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
      awardsGivenResult,
      awardsReceivedResult,
      likesGivenResult,
      followersResult,
      thoughtOfYouSharesResult,
      madeMeSmileSharesResult,
      thoughtOfYouPhotoShares,
      madeMeSmilePhotoShares,
      pinnedPhotoCount,
      weeklyTickleSharesResult,
      weeklyPhotoShareEventsResult,
    ] = await Promise.all([
      supabase
        .from('tickle_entries')
        .select('id, entry_date, text_content, like_count, tickle_nature, goal_id')
        .eq('user_id', session.user.id)
        .gte('entry_date', weekStartDate),
      supabase
        .from('tickle_entries')
        .select('id, text_content, like_count, tickle_nature')
        .eq('user_id', session.user.id)
        .gte('entry_date', trailingCutoff),
      supabase.from('goals').select('*').order('created_at', { ascending: true }),
      supabase
        .from('awards')
        .select('id, award_type, created_at, tickle_entries(text_content)')
        .eq('user_id', session.user.id)
        .gte('created_at', weekStartISO),
      supabase
        .from('notifications')
        .select(
          'id, award_type, created_at, tickle_entries(text_content), profiles!notifications_actor_id_fkey(username, avatar_emoji, country)'
        )
        .eq('recipient_id', session.user.id)
        .eq('type', 'award')
        .gte('created_at', weekStartISO),
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
      supabase
        .from('tickle_shares')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', session.user.id)
        .eq('caption', 'made_me_smile')
        .gte('created_at', weekStartISO),
      getPhotoShareCountSince(session.user.id, weekStartISO, 'thought_of_you'),
      getPhotoShareCountSince(session.user.id, weekStartISO, 'made_me_smile'),
      getPinnedPhotoCountSince(session.user.id, weekStartDate),
      // All-captions weekly total for the new Shares stat card -- same
      // combined definition as Home's all-time Shares pill (tickle_shares
      // + photo_share_events, both cloud), just with a week filter added.
      // Deliberately NOT lib/pinBoardDb.js's local-only photo_shares
      // table (already used above for the caption-specific Connection
      // sentences) -- that's device-local and wouldn't survive a
      // reinstall or a second device, same correctness reasoning Home's
      // pill already established.
      supabase
        .from('tickle_shares')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', session.user.id)
        .gte('created_at', weekStartISO),
      supabase
        .from('photo_share_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('shared_at', weekStartISO),
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
    if (!awardsGivenResult.error) setAwardsGiven(awardsGivenResult.data || []);
    if (!awardsReceivedResult.error) setAwardsReceived(awardsReceivedResult.data || []);
    if (!likesGivenResult.error) setLikesGiven(likesGivenResult.count || 0);
    if (!followersResult.error) setNewFollowers(followersResult.count || 0);

    const cloudThoughtOfYou = thoughtOfYouSharesResult.error ? 0 : (thoughtOfYouSharesResult.count || 0);
    setThoughtOfYouSends(cloudThoughtOfYou + (thoughtOfYouPhotoShares || 0));

    const cloudMadeMeSmile = madeMeSmileSharesResult.error ? 0 : (madeMeSmileSharesResult.count || 0);
    setMadeMeSmileSends(cloudMadeMeSmile + (madeMeSmilePhotoShares || 0));

    setPhotoCount(pinnedPhotoCount || 0);

    const weeklyTickleShares = weeklyTickleSharesResult.error ? 0 : (weeklyTickleSharesResult.count || 0);
    const weeklyPhotoShareEvents = weeklyPhotoShareEventsResult.error ? 0 : (weeklyPhotoShareEventsResult.count || 0);
    setWeeklySharesTotal(weeklyTickleShares + weeklyPhotoShareEvents);

    setLoading(false);
  }, [session, weekStartDay, weekStartDate]);

  useFocusEffect(
    useCallback(() => {
      loadSummary();
    }, [loadSummary])
  );

  const weeklyTickles = weekEntries.length;
  // Same formula as VibeCard's own corner dot -- also the exact formula
  // Home's old (pre-redesign) streak-card sunburst used, tinted from
  // the user's accent color rather than a fixed vibe color. One shared
  // value since all three cards below share the same accent fill.
  const weeklyStatDotColor = withAlpha(lighten(accent.card, 0.5), 0.4);

  // Per-day-per-vibe breakdown for the rhythm chart -- weekEntries is
  // already scoped to this week (see loadSummary's query), so this is
  // just a client-side grouping pass, same reuse-what's-already-loaded
  // shape as Home's own vibe-card counts. Day order follows the
  // person's own week_start_day (Settings > "Week starts on"), not a
  // hardcoded Mon-Sun layout, matching every other "this week" concept
  // in the app.
  const weekDates = currentWeekDates(weekStartDay);
  const dayTotals = Object.fromEntries(weekDates.map((d) => [d, { received: 0, given: 0, self: 0 }]));
  for (const e of weekEntries) {
    if (e.tickle_nature && dayTotals[e.entry_date]) {
      dayTotals[e.entry_date][e.tickle_nature]++;
    }
  }
  const natureCounts = weekDates.reduce(
    (totals, d) => ({
      received: totals.received + dayTotals[d].received,
      given: totals.given + dayTotals[d].given,
      self: totals.self + dayTotals[d].self,
    }),
    { received: 0, given: 0, self: 0 }
  );
  const hasVibes = natureCounts.received > 0 || natureCounts.given > 0 || natureCounts.self > 0;

  // Single largest cell across the whole grid (all 7 days x 3 vibes) --
  // avoids a div-by-zero on a vibe-free week. daily_total_goal isn't
  // read here: the bubble grid doesn't visualize the goal line (still
  // configurable in Settings, just not shown on this view for now).
  const maxCellCount = Math.max(1, ...weekDates.flatMap((d) => NATURE_ORDER.map((key) => dayTotals[d][key])));

  const activeGoals = goals.filter((g) => !g.achieved_at);
  const achievedThisWeek = goals.filter((g) => g.achieved_at && g.achieved_at >= currentWeekStartISO(weekStartDay));
  const goalProgress = activeGoals
    .map((goal) => ({ goal, count: weekEntries.filter((e) => e.goal_id === goal.id).length }))
    .filter(({ count }) => count > 0);

  const hasConnection = likesGiven > 0 || newFollowers > 0 || thoughtOfYouSends > 0 || madeMeSmileSends > 0;

  return (
    <WallpaperBackground>
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
            <View style={styles.weeklyStatsRow}>
              <View style={[styles.weeklyStatCard, { backgroundColor: accent.card }]}>
                <View style={[styles.weeklyStatDot, { backgroundColor: weeklyStatDotColor }]} />
                <Text style={[styles.weeklyStatNumber, { color: textOn(accent.card) }]}>{weeklyTickles}</Text>
                <Text style={[styles.weeklyStatLabel, { color: textOn(accent.card) }]}>Tickles</Text>
              </View>
              <View style={[styles.weeklyStatCard, { backgroundColor: accent.card }]}>
                <View style={[styles.weeklyStatDot, { backgroundColor: weeklyStatDotColor }]} />
                <Text style={[styles.weeklyStatNumber, { color: textOn(accent.card) }]}>{likesGiven}</Text>
                {/* Deliberately not shortened to "Likes" -- dropping
                    "given" would lose the given/received distinction
                    the app is careful about elsewhere (e.g. Home's own
                    received/given/self vibes). Left to wrap to 2 lines
                    at this card width instead. */}
                <Text style={[styles.weeklyStatLabel, { color: textOn(accent.card) }]}>Likes given</Text>
              </View>
              <View style={[styles.weeklyStatCard, { backgroundColor: accent.card }]}>
                <View style={[styles.weeklyStatDot, { backgroundColor: weeklyStatDotColor }]} />
                <Text style={[styles.weeklyStatNumber, { color: textOn(accent.card) }]}>{weeklySharesTotal}</Text>
                <Text style={[styles.weeklyStatLabel, { color: textOn(accent.card) }]}>Shares</Text>
              </View>
            </View>

            {mostLiked && (
              <>
                <Text style={[styles.sectionLabel, styles.pinnedSectionLabel]}>Most liked this week</Text>
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
                        styles.vibeIconSlot,
                        {
                          width: SAVED_ENTRY_DOT_SIZE,
                          height: SAVED_ENTRY_DOT_SIZE,
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                      ]}
                    >
                      {!!VIBE_COLORS[mostLiked.tickle_nature] && (
                        <NatureIcon
                          nature={mostLiked.tickle_nature}
                          size={SAVED_ENTRY_DOT_SIZE}
                          color={VIBE_COLORS[mostLiked.tickle_nature]}
                        />
                      )}
                    </View>
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
                <View style={styles.rhythmTotalsRow}>
                  {NATURE_ORDER.map((key) => (
                    <View
                      key={key}
                      style={[
                        styles.rhythmTotalPill,
                        { backgroundColor: withAlpha(VIBE_COLORS[key], 0.14), borderColor: VIBE_COLORS[key] },
                      ]}
                    >
                      <NatureIcon nature={key} size={13} color={darken(VIBE_COLORS[key], 0.3)} />
                      <Text style={styles.rhythmTotalText}>{natureCounts[key]}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.rhythmGridWrap}>
                  <View style={styles.rhythmHeaderRow}>
                    <View style={styles.rhythmRowLabelSpacer} />
                    {weekDates.map((date) => (
                      <Text key={date} style={styles.rhythmDayLabel}>{weekdayLabel(date)}</Text>
                    ))}
                  </View>
                  {NATURE_ORDER.map((key) => (
                    <View key={key} style={styles.rhythmGridRow}>
                      <View style={styles.rhythmRowLabel}>
                        <NatureIcon nature={key} size={16} color={VIBE_COLORS[key]} />
                      </View>
                      {weekDates.map((date) => {
                        const count = dayTotals[date][key];
                        const size = bubbleDiameter(count, maxCellCount);
                        return (
                          <View key={date} style={styles.rhythmDayCell}>
                            {count > 0 ? (
                              <View
                                style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: VIBE_COLORS[key] }}
                              />
                            ) : (
                              <View style={styles.rhythmEmptyDot} />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
                <View style={styles.rhythmLegendRow}>
                  {NATURE_ORDER.map((key) => (
                    <View key={key} style={styles.rhythmLegendItem}>
                      <View style={[styles.rhythmLegendDot, { backgroundColor: VIBE_COLORS[key] }]} />
                      <Text style={styles.rhythmLegendText}>{NATURE_LABELS[key]}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {hasConnection && (
              <>
                <Text style={styles.sectionLabel}>Connection</Text>
                {likesGiven > 0 && (
                  <View style={styles.connectionCard}>
                    <View style={styles.connectionDot} />
                    <Text style={styles.connectionCardText}>
                      You gave {likesGiven} {likesGiven === 1 ? 'like' : 'likes'} this week.
                    </Text>
                  </View>
                )}
                {newFollowers > 0 && (
                  <View style={styles.connectionCard}>
                    <View style={styles.connectionDot} />
                    <Text style={styles.connectionCardText}>
                      You gained {newFollowers} new {newFollowers === 1 ? 'follower' : 'followers'} this week.
                    </Text>
                  </View>
                )}
                {thoughtOfYouSends > 0 && (
                  <View style={styles.connectionCard}>
                    <View style={styles.connectionDot} />
                    <Text style={styles.connectionCardText}>
                      You thought of someone {thoughtOfYouSends} {thoughtOfYouSends === 1 ? 'time' : 'times'}.
                    </Text>
                  </View>
                )}
                {madeMeSmileSends > 0 && (
                  <View style={styles.connectionCard}>
                    <View style={styles.connectionDot} />
                    <Text style={styles.connectionCardText}>
                      You shared your smile {madeMeSmileSends} {madeMeSmileSends === 1 ? 'time' : 'times'}.
                    </Text>
                  </View>
                )}
              </>
            )}

            {(achievedThisWeek.length > 0 || goalProgress.length > 0) && (
              <>
                <Text style={styles.sectionLabel}>Goals</Text>
                {achievedThisWeek.map((g) => (
                  <View
                    key={g.id}
                    style={[styles.goalCard, { backgroundColor: withAlpha(g.color, 0.14), borderColor: g.color }]}
                  >
                    <View style={[styles.goalDot, { backgroundColor: g.color }]} />
                    <Text style={styles.goalText}>🎉 Achieved "{g.label}" this week</Text>
                  </View>
                ))}
                {goalProgress.map(({ goal, count }) => (
                  <View
                    key={goal.id}
                    style={[styles.goalCard, { backgroundColor: withAlpha(goal.color, 0.14), borderColor: goal.color }]}
                  >
                    <View style={[styles.goalDot, { backgroundColor: goal.color }]} />
                    <Text style={styles.goalText}>
                      {count} {count === 1 ? 'tickle' : 'tickles'} toward "{goal.label}"
                    </Text>
                  </View>
                ))}
              </>
            )}

            {(awardsReceived.length > 0 || awardsGiven.length > 0) && (
              <>
                <Text style={styles.sectionLabel}>High Fives</Text>
                {awardsReceived.map((n) => {
                  const award = AWARD_TYPES[n.award_type];
                  const flag = n.profiles?.country ? ` ${flagEmoji(n.profiles.country)}` : '';
                  const actorName = n.profiles?.username ? `${n.profiles.username}${flag}` : 'Someone';
                  return (
                    <View
                      key={n.id}
                      style={[styles.awardCard, { backgroundColor: withAlpha(award.color, 0.14), borderColor: award.color }]}
                    >
                      <Ionicons name={AWARD_HAND_ICON} size={16} color={award.color} />
                      <Text style={styles.awardText} numberOfLines={2}>
                        {actorName} gave you a {award.label} high five
                        {n.tickle_entries?.text_content ? `: ${n.tickle_entries.text_content}` : ''}
                      </Text>
                    </View>
                  );
                })}
                {awardsGiven.map((a) => {
                  const award = AWARD_TYPES[a.award_type];
                  return (
                    <View
                      key={a.id}
                      style={[styles.awardCard, { backgroundColor: withAlpha(award.color, 0.14), borderColor: award.color }]}
                    >
                      <Ionicons name={AWARD_HAND_ICON} size={16} color={award.color} />
                      <Text style={styles.awardText} numberOfLines={2}>
                        You gave a {award.label} high five
                        {a.tickle_entries?.text_content ? `: ${a.tickle_entries.text_content}` : ''}
                      </Text>
                    </View>
                  );
                })}
              </>
            )}

            {photoCount > 0 && (
              <>
                <Text style={styles.sectionLabel}>Tickle Pics</Text>
                <View style={styles.pinBoardCard}>
                  <Text style={styles.pinBoardCardText}>
                    You added {photoCount} {photoCount === 1 ? 'photo' : 'photos'} to your Tickle Pics this week.
                  </Text>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark },
  weekRange: { fontSize: 13, color: C.subtext, marginTop: 2, marginBottom: 20 },
  loader: { marginTop: 40 },

  weeklyStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  // Card shape and corner-dot sizing both reused from VibeCard as-is
  // (borderRadius 18 + overflow hidden; 112px dot at -36/-36) -- Home's
  // and this screen's content padding are both 20, so the two screens'
  // 3-column cards land at very similar widths and the proportions
  // carry over without new math. Number/label live INSIDE the card
  // here (unlike VibeCard's external label below it) since there's
  // only one number per card, not three stacked ones needing the room.
  weeklyStatCard: {
    flex: 1, borderRadius: 18, overflow: 'hidden',
    paddingVertical: 14, alignItems: 'center',
  },
  weeklyStatDot: {
    position: 'absolute', top: -36, right: -36,
    width: 112, height: 112, borderRadius: 56,
  },
  weeklyStatNumber: { fontSize: 24, fontWeight: 'bold' },
  weeklyStatLabel: { fontSize: 12, marginTop: 2, textAlign: 'center' },

  sectionLabel: { fontSize: 14, fontWeight: '600', color: C.subtext, marginTop: 8, marginBottom: 8 },

  entryCard: {
    backgroundColor: withAlpha(C.amberDark, 0.16), borderWidth: 1.5, borderColor: C.amberDark,
    borderRadius: 16, padding: 14, marginBottom: 16,
  },
  pinnedSectionLabel: { color: C.sparkleText },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  vibeIconSlot: { marginRight: 12, marginTop: 4 },
  entryBody: { flex: 1 },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },
  entryLikes: { fontSize: 12, color: C.teal, fontWeight: '600', marginTop: 6 },

  // Small color-coded pill per vibe -- pill shape (borderRadius 999,
  // same as Home's stat pills) but the light-wash + border treatment
  // (withAlpha(color, 0.14) bg, border in that same color) already
  // established on this screen's own goalCard/awardCard/connectionCard,
  // not a solid fill. Icon is darkened (not the vibe's raw full-
  // saturation color, unlike awardCard's icon) -- at this small a size,
  // a lighter vibe color (e.g. the amber vibe) read as barely visible
  // against its own 14%-alpha wash; darkening keeps the per-vibe color
  // identity while restoring contrast. Number stays fixed C.text like
  // goalText/awardText, not derived from the vibe color.
  rhythmTotalsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 14 },
  rhythmTotalPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, borderWidth: 1, paddingVertical: 5, paddingHorizontal: 12,
  },
  rhythmTotalText: { fontSize: 13, fontWeight: '700', color: C.text },

  rhythmGridWrap: {
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingVertical: 12, paddingHorizontal: 10, marginBottom: 6,
  },
  rhythmHeaderRow: { flexDirection: 'row', marginBottom: 10 },
  // Matches rhythmRowLabel's width below so the day-label header lines
  // up with the bubble columns, not shifted by the row-icon column.
  rhythmRowLabelSpacer: { width: 24 },
  rhythmDayLabel: { flex: 1, fontSize: 11, color: C.subtext, textAlign: 'center' },
  rhythmGridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rhythmRowLabel: { width: 24, alignItems: 'center' },
  rhythmDayCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rhythmEmptyDot: { width: BUBBLE_EMPTY, height: BUBBLE_EMPTY, borderRadius: BUBBLE_EMPTY / 2, backgroundColor: C.border },

  rhythmLegendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  rhythmLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rhythmLegendDot: { width: 8, height: 8, borderRadius: 4 },
  rhythmLegendText: { fontSize: 11, color: C.subtext },

  goalCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 8,
  },
  goalDot: { width: 10, height: 10, borderRadius: 5 },
  goalText: { flex: 1, fontSize: 14, color: C.text },

  awardCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 8,
  },
  awardText: { flex: 1, fontSize: 14, color: C.text },

  connectionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: withAlpha(C.teal, 0.14), borderWidth: 1, borderColor: C.teal,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 8,
  },
  connectionDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.teal },
  connectionCardText: { flex: 1, fontSize: 14, color: C.tealText, lineHeight: 20 },

  pinBoardCard: {
    backgroundColor: C.sparkleBg, borderWidth: 1, borderColor: C.amberDark,
    borderRadius: 16, padding: 14, marginBottom: 16,
  },
  pinBoardCardText: { fontSize: 14, color: C.sparkleText, lineHeight: 20 },
});
