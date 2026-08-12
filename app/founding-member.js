import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Share, Switch, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, accentFor, darken, textOn, withAlpha } from '../lib/theme';
import WallpaperBackground from '../components/WallpaperBackground';
import {
  MONTHLY_REQUIREMENTS,
  checkpointWindow,
  fetchMonthProgress,
  fetchEvaluatedMonthIndexes,
  advanceFoundingMemberProgress,
  optOutOfFoundingMember,
} from '../lib/foundingMember';

function formatBadge(number) {
  return number ? `FM${number}` : null;
}

export default function FoundingMember() {
  const { session, profile, refreshProfile } = useAuth();
  const accentDark = darken(accentFor(profile?.accent_theme).card, 0.35);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [enrollment, setEnrollment] = useState(null);
  const [monthIndex, setMonthIndex] = useState(1);
  const [progress, setProgress] = useState(null);
  const [referralCount, setReferralCount] = useState(0);
  // 1000 here is just a pre-load placeholder, not the real cap -- the
  // pool now auto-expands in 100-number blocks server-side (see
  // supabase/migrations/0030), so app_config.founding_members_cap
  // (fetched below) is the only real source of truth for this value.
  const [poolStats, setPoolStats] = useState({ granted: 0, cap: 1000, nextNumber: null });
  const [savingTakingPart, setSavingTakingPart] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadError('');

    try {
      const userId = session.user.id;
      const currentEnrollment = await advanceFoundingMemberProgress(userId);
      setEnrollment(currentEnrollment);

      // advanceFoundingMemberProgress can change profiles state on the
      // server (referral_code backfill, is_founding_member/
      // founding_member_number on completion) -- refresh so this
      // screen's own reads of `profile` below reflect it, same as the
      // toggle handlers already do after their own writes.
      await refreshProfile();

      // Shown exactly once -- see supabase/migrations/0027. Marking it
      // seen here (not behind a separate "Got it" tap) matches how
      // home_guide_seen already works elsewhere in this app.
      if (currentEnrollment.status === 'failed' && !profile?.founding_member_failure_message_seen) {
        await supabase
          .from('profiles')
          .update({ founding_member_failure_message_seen: true })
          .eq('id', userId);
        await refreshProfile();
      }

      if (currentEnrollment.status === 'active') {
        const attempt = currentEnrollment.restart_count + 1;
        const evaluated = await fetchEvaluatedMonthIndexes(userId, attempt);
        const idx = Math.min(evaluated.length ? Math.max(...evaluated) + 1 : 1, 6);
        setMonthIndex(idx);
        const window = checkpointWindow(currentEnrollment.attempt_started_at, idx);
        setProgress(await fetchMonthProgress(userId, window));
      }

      const [referralsResult, configResult, nextSlotResult] = await Promise.all([
        supabase
          .from('founding_member_referrals')
          .select('id', { count: 'exact', head: true })
          .eq('referrer_id', userId),
        supabase
          .from('app_config')
          .select('founding_members_awarded_count, founding_members_cap')
          .eq('id', 1)
          .single(),
        supabase
          .from('founding_member_slots')
          .select('number')
          .eq('status', 'available')
          .order('number')
          .limit(1)
          .maybeSingle(),
      ]);

      setReferralCount(referralsResult.count || 0);
      setPoolStats({
        granted: configResult.data?.founding_members_awarded_count ?? 0,
        cap: configResult.data?.founding_members_cap ?? 1000,
        nextNumber: nextSlotResult.data?.number ?? null,
      });
    } catch (err) {
      setLoadError(err.message || 'Something went wrong loading this page.');
    } finally {
      setLoading(false);
    }
  }, [session, profile?.founding_member_failure_message_seen, refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Turning this off is now a real, permanent exit (see the addendum
  // -- previously it was just a reversible visibility flag). There's
  // no direct write for "off" anymore: it always routes through the
  // double-warning confirmation below, then the opt_out_of_founding_
  // member RPC, which drives the same terminal state as genuinely
  // failing the quest. Turning it *on* has nothing left to do -- the
  // only thing that ever sets it false is the opt-out RPC itself,
  // which also ends the enrollment, so there's no reversible "off"
  // state left to turn back on from; this branch only exists to
  // absorb Switch's onValueChange(true) callback if it fires.
  function handleToggleTakingPart(value) {
    if (value === false) {
      confirmOptOut();
    }
  }

  function confirmOptOut() {
    Alert.alert(
      'Stop taking part in Founding Member?',
      "This can't be undone. If you'd like another shot at becoming a Founding Member later, you'd need to delete your account and start fresh, which means losing all your tickles and data.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: confirmOptOutFinal },
      ]
    );
  }

  function confirmOptOutFinal() {
    Alert.alert(
      'Are you sure?',
      "This is the last step — once confirmed, you're on the regular free plan.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: "Yes, I'm sure", style: 'destructive', onPress: handleOptOut },
      ]
    );
  }

  async function handleOptOut() {
    setSavingTakingPart(true);
    await optOutOfFoundingMember(session.user.id);
    setSavingTakingPart(false);
    await refreshProfile();
    await load();
  }

  async function handleToggleReminders(value) {
    setSavingReminders(true);
    await supabase.from('profiles').update({ founding_member_reminders_enabled: value }).eq('id', session.user.id);
    setSavingReminders(false);
    await refreshProfile();
  }

  function shareReferralCode() {
    if (!profile?.referral_code) return;
    Share.share({
      message: `Join me on DayTickles! Use my code ${profile.referral_code} when you sign up.`,
    });
  }

  const takingPart = profile?.founding_member_taking_part !== false;
  const badgeNumber = formatBadge(profile?.founding_member_number);

  return (
    <WallpaperBackground>
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Founding Member</Text>

        {loading ? (
          <ActivityIndicator color={C.rust} style={styles.loader} />
        ) : loadError ? (
          <Text style={styles.cardSubtext}>{loadError}</Text>
        ) : enrollment?.status === 'failed' ? (
          <View style={[styles.card, { backgroundColor: withAlpha(C.subtext, 0.1), borderColor: C.border }]}>
            <Text style={styles.cardText}>
              This opportunity has closed for now — you're on the regular free plan.
            </Text>
            <Text style={styles.cardSubtext}>
              This can't be undone. If you'd like another shot at becoming a Founding Member later, you'd
              need to delete your account and start fresh — which means losing all your tickles and data,
              so it's here but we don't recommend it lightly. A lighter option: a subscription unlocks more
              functionality without starting over, and it's inexpensive.
            </Text>
            <Text style={styles.cardSubtext}>
              You shared DayTickles and connected with others along the way — that's the part that mattered.
            </Text>
          </View>
        ) : enrollment?.status === 'completed' ? (
          <>
            <View style={[styles.heroCard, { backgroundColor: accentDark }]}>
              <MaterialCommunityIcons name="crown" size={32} color={textOn(accentDark)} />
              <Text style={[styles.heroTitle, { color: textOn(accentDark) }]}>You're a Founding Member</Text>
              <Text style={[styles.heroSubtitle, { color: textOn(accentDark) }]}>
                {badgeNumber || 'All numbered badges have been claimed — you\'re still a lifetime Founding Member'}
              </Text>
            </View>
            <Text style={styles.cardSubtext}>
              Lifetime top-tier access, on us — thank you for being here from the start.
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: accentDark, borderColor: accentDark }]}>
              <Text style={[styles.cardSubtext, { color: textOn(accentDark) }]}>
                Next FM number available is:{' '}
                {poolStats.nextNumber ? formatBadge(poolStats.nextNumber) : 'none left'}
              </Text>
              <Text style={[styles.cardSubtext, { color: textOn(accentDark) }]}>
                {poolStats.granted} of {poolStats.cap} claimed
              </Text>

              <Text style={[styles.cardHeading, { color: textOn(accentDark), marginTop: 12 }]}>
                Refer a Friend
              </Text>
              <Text style={[styles.cardSubtext, { color: textOn(accentDark) }]}>
                Refer 2 people and lock in the next available number right away — you'll still need to
                finish to keep it.
              </Text>
              <Text style={[styles.referralCode, { color: textOn(accentDark) }]}>{profile?.referral_code}</Text>
              <Text style={[styles.cardSubtext, { color: textOn(accentDark) }]}>
                {badgeNumber
                  ? `${badgeNumber} reserved — finish your 6 months to keep it`
                  : `${referralCount}/2 referred`}
              </Text>
              <TouchableOpacity onPress={shareReferralCode} style={styles.shareButton}>
                <Text style={[styles.shareButtonText, { color: textOn(accentDark) }]}>Share my code</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Your quest.</Text>
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={styles.cardHeading}>Month {monthIndex} of 6</Text>
              {MONTHLY_REQUIREMENTS.map((r) => {
                const count = progress?.[r.key] || 0;
                const met = count >= r.target;
                return (
                  <View key={r.key} style={styles.reqRow}>
                    <Ionicons
                      name={met ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={met ? C.teal : C.subtext}
                    />
                    <Text style={styles.reqText}>
                      {r.label}: {Math.min(count, r.target)}/{r.target}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, !takingPart && styles.toggleLabelDisabled]}>
                Home-screen reminders
              </Text>
              <Switch
                value={!!profile?.founding_member_reminders_enabled}
                onValueChange={handleToggleReminders}
                disabled={savingReminders || !takingPart}
                trackColor={{ false: C.border, true: accentDark }}
                thumbColor={C.card}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Taking part</Text>
              <Switch
                value={takingPart}
                onValueChange={handleToggleTakingPart}
                disabled={savingTakingPart}
                trackColor={{ false: C.border, true: accentDark }}
                thumbColor={C.card}
              />
            </View>
          </>
        )}

        {enrollment?.status === 'completed' && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={styles.cardHeading}>Founding Member numbers</Text>
            <Text style={styles.cardSubtext}>
              {poolStats.granted} of {poolStats.cap} claimed
            </Text>
            <Text style={styles.cardSubtext}>
              Next available: {poolStats.nextNumber ? formatBadge(poolStats.nextNumber) : 'none left'}
            </Text>
          </View>
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
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 20 },
  loader: { marginTop: 40 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: C.subtext, marginBottom: 8 },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  cardHeading: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 8 },
  cardText: { fontSize: 15, color: C.text, lineHeight: 20 },
  cardSubtext: { fontSize: 13, color: C.subtext, marginTop: 4, lineHeight: 18 },

  heroCard: { borderRadius: 20, paddingVertical: 24, alignItems: 'center', marginBottom: 12, gap: 6 },
  heroTitle: { fontSize: 18, fontWeight: 'bold' },
  heroSubtitle: { fontSize: 15, fontWeight: '600' },

  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  reqText: { fontSize: 14, color: C.text },

  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  toggleLabel: { fontSize: 15, color: C.text },
  toggleLabelDisabled: { color: C.subtext },

  referralCode: { fontSize: 20, fontWeight: 'bold', color: C.rustDark, marginTop: 10, letterSpacing: 1 },
  shareButton: { marginTop: 12 },
  shareButtonText: { fontSize: 14, fontWeight: '600' },
});
