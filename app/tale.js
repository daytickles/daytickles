import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { File } from 'expo-file-system';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { C, NATURE_LABELS, withAlpha } from '../lib/theme';
import { showAlert } from '../lib/themedAlert';
import { flagEmoji } from '../lib/country';
import { compareChapters, taleIconName } from '../lib/tales';
import { initPinBoardDb, getPhotosForEntries } from '../lib/pinBoardDb';
import InitialsAvatar from '../components/InitialsAvatar';
import FoundingMemberBadge from '../components/FoundingMemberBadge';
import PhotoEnlargeModal from '../components/PhotoEnlargeModal';
import WallpaperBackground from '../components/WallpaperBackground';

function formatEntryDate(entryDate) {
  return new Date(`${entryDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The Tale view (migration 0067) -- reached by tapping a chapter's Tale
// chip on EntryCard, a tale_chapter notification, or a row in Manage
// Tales. Every chapter, oldest first by entry_date, with its computed
// chapter number; Ongoing/Complete status; and "Follow this Tale", a
// relationship separate from following the author (tale_follows).
//
// Chapters render as a simple read-only list, not full EntryCards: the
// like/favorite/High Five/follow handlers (with their soft caps and the
// like push) all live inside feed.js, and duplicating them here for v1
// wasn't worth it. Reacting to a chapter still happens on the feed.
//
// RLS returns the Tale's public chapters to everyone, plus the owner's
// own Un-Rippled ones to the owner only -- those are shown to the owner
// unnumbered, since numbering only counts what others can actually see.
export default function Tale() {
  const { session } = useAuth();
  const params = useLocalSearchParams();
  const taleId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [tale, setTale] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [photoUris, setPhotoUris] = useState(new Map());
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [enlargeUri, setEnlargeUri] = useState(null);

  const isOwner = !!tale && tale.user_id === session?.user.id;

  const loadTale = useCallback(async () => {
    if (!session || !taleId) return;
    setLoading(true);

    const [taleRes, chaptersRes, followRes, countRes] = await Promise.all([
      supabase
        .from('tales')
        // Explicit FK hint: tale_follows links tales and profiles too, so
        // a bare profiles(...) embed would be ambiguous to PostgREST.
        .select('id, user_id, title, blurb, icon, completed_at, created_at, profiles!tales_user_id_fkey(username, accent_theme, country, founding_member_number)')
        .eq('id', taleId)
        .maybeSingle(),
      supabase
        .from('tickle_entries')
        .select('id, user_id, entry_date, created_at, text_content, tickle_nature, visibility, entry_kind, media_url')
        .eq('tale_id', taleId)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('tale_follows')
        .select('id')
        .eq('tale_id', taleId)
        .eq('follower_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('tale_follows')
        .select('id', { count: 'exact', head: true })
        .eq('tale_id', taleId),
    ]);

    const taleData = taleRes.error ? null : taleRes.data;
    const chapterRows = chaptersRes.error ? [] : [...(chaptersRes.data || [])].sort(compareChapters);
    setTale(taleData);
    setChapters(chapterRows);
    setIsFollowing(!followRes.error && !!followRes.data);
    setFollowerCount(countRes.error ? 0 : countRes.count || 0);

    // Photos: the public media_url for anyone, plus -- for the owner's
    // own chapters -- the local Pin Board file this device has, same
    // local-first resolution as feed.js's resolveLinkedPhotoUris.
    const uris = new Map();
    const ownIds = chapterRows.filter((c) => c.user_id === session.user.id).map((c) => c.id);
    let localPhotos = new Map();
    if (ownIds.length) {
      await initPinBoardDb(session.user.id);
      localPhotos = await getPhotosForEntries(session.user.id, ownIds);
    }
    for (const c of chapterRows) {
      const local = localPhotos.get(c.id);
      if (local && new File(local.file_path).exists) uris.set(c.id, local.file_path);
      else if (c.media_url) uris.set(c.id, c.media_url);
    }
    setPhotoUris(uris);

    setLoading(false);
  }, [session, taleId]);

  useFocusEffect(
    useCallback(() => {
      loadTale();
    }, [loadTale])
  );

  // Optimistic, same shape as feed.js's handleToggleFollow -- but no
  // cap check: Tale follows are uncapped and don't count toward the
  // `following` ceiling (product decision 2026-10-02).
  async function handleToggleFollow() {
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowerCount((n) => n + (wasFollowing ? -1 : 1));

    const { error } = wasFollowing
      ? await supabase.from('tale_follows').delete().eq('tale_id', taleId).eq('follower_id', session.user.id)
      : await supabase.from('tale_follows').insert({ tale_id: taleId, follower_id: session.user.id });

    if (error) {
      setIsFollowing(wasFollowing);
      setFollowerCount((n) => n + (wasFollowing ? 1 : -1));
    }
  }

  function confirmComplete() {
    showAlert(
      'Mark as complete?',
      `"${tale.title}" will show as Complete to everyone following it. Its Tics stay exactly as they are, but no new Tics can be added.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete', onPress: handleComplete },
      ]
    );
  }

  async function handleComplete() {
    setMutating(true);
    const { error } = await supabase
      .from('tales')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', taleId);
    setMutating(false);
    if (error) showAlert("Couldn't complete this Multickle", error.message);
    else await loadTale();
  }

  // Numbered over public chapters only (see lib/tales.js's own header).
  let n = 0;
  const numbered = chapters.map((c) => ({
    ...c,
    chapterNumber: c.visibility === 'public' ? ++n : null,
  }));

  function renderChapter(c) {
    const isPhotoOnly = c.entry_kind === 'photo_only';
    const photoUri = photoUris.get(c.id);
    return (
      <View key={c.id} style={[styles.chapterCard, c.chapterNumber == null && styles.chapterCardHidden]}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterLabel}>
            {c.chapterNumber != null ? `Tic ${c.chapterNumber}` : 'Not Rippled — only you can see this'}
          </Text>
          <Text style={styles.chapterDate}>{formatEntryDate(c.entry_date)}</Text>
        </View>
        {!!photoUri && (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setEnlargeUri(photoUri)}>
            <Image
              source={{ uri: photoUri }}
              style={isPhotoOnly ? styles.chapterPhotoSquare : styles.chapterPhotoStrip}
            />
          </TouchableOpacity>
        )}
        {isPhotoOnly ? (
          !!NATURE_LABELS[c.tickle_nature] && (
            <Text style={styles.chapterCaption}>{NATURE_LABELS[c.tickle_nature]}</Text>
          )
        ) : (
          <Text style={styles.chapterText}>{c.text_content}</Text>
        )}
      </View>
    );
  }

  const author = tale?.profiles;

  return (
    <WallpaperBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        {loading && !tale && <ActivityIndicator color={C.rust} style={styles.loader} />}

        {!loading && !tale && (
          <Text style={styles.emptyText}>This Multickle isn't available anymore.</Text>
        )}

        {!!tale && (
          <>
            <View style={styles.titleRow}>
              <Ionicons name={taleIconName(tale.icon)} size={20} color={C.rust} />
              <Text style={styles.title}>{tale.title}</Text>
            </View>

            <View style={styles.authorRow}>
              <InitialsAvatar username={author?.username} accentTheme={author?.accent_theme} size={18} />
              <Text style={styles.authorText} numberOfLines={1}>{author?.username}</Text>
              {!!author?.country && <Text style={styles.authorFlag}>{flagEmoji(author.country)}</Text>}
              {!!author?.founding_member_number && (
                <FoundingMemberBadge number={author.founding_member_number} compact />
              )}
            </View>

            {!!tale.blurb && <Text style={styles.blurb}>{tale.blurb}</Text>}

            <View style={styles.statusRow}>
              <View style={[styles.statusPill, tale.completed_at ? styles.statusPillComplete : styles.statusPillOngoing]}>
                <Text style={[styles.statusPillText, tale.completed_at && styles.statusPillTextComplete]}>
                  {tale.completed_at ? 'Complete' : 'Ongoing'}
                </Text>
              </View>
              <Text style={styles.statusMeta}>
                {n} Tic{n === 1 ? '' : 's'} · {followerCount} follower{followerCount === 1 ? '' : 's'}
              </Text>
            </View>

            {/* Owner can't follow their own Tale (also blocked
                server-side, prevent_self_tale_follow) -- they get
                Complete here instead, same action as Manage Tales. */}
            {isOwner ? (
              !tale.completed_at && (
                <TouchableOpacity
                  style={[styles.actionButton, mutating && styles.actionButtonDisabled]}
                  onPress={confirmComplete}
                  disabled={mutating}
                >
                  <Text style={styles.actionButtonText}>Mark as Complete</Text>
                </TouchableOpacity>
              )
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, isFollowing && styles.actionButtonActive]}
                onPress={handleToggleFollow}
              >
                <Text style={[styles.actionButtonText, isFollowing && styles.actionButtonTextActive]}>
                  {isFollowing ? 'Following this Multickle' : 'Follow this Multickle'}
                </Text>
              </TouchableOpacity>
            )}

            {numbered.map(renderChapter)}

            {!loading && numbered.length === 0 && (
              <Text style={styles.emptyText}>
                {isOwner
                  ? 'No Tics yet — add a Rippled Tickle from its ⋯ menu.'
                  : 'No Tics yet.'}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <PhotoEnlargeModal uri={enlargeUri} onDismiss={() => setEnlargeUri(null)} />
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  loader: { marginTop: 12 },
  emptyText: { color: C.subtext, textAlign: 'center', marginTop: 24 },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, flexShrink: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  authorText: { fontSize: 13, fontWeight: '600', color: C.rustDark, flexShrink: 1 },
  authorFlag: { fontSize: 13 },
  blurb: { fontSize: 14, color: C.text, lineHeight: 20, marginTop: 10 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  statusPill: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1 },
  statusPillOngoing: { backgroundColor: C.sparkleBg, borderColor: C.amberDark },
  statusPillComplete: { backgroundColor: withAlpha(C.teal, 0.14), borderColor: C.teal },
  statusPillText: { fontSize: 11, fontWeight: '700', color: C.sparkleText },
  statusPillTextComplete: { color: C.tealText },
  statusMeta: { fontSize: 12, color: C.subtext },

  actionButton: {
    marginTop: 14, marginBottom: 18, paddingVertical: 10, borderRadius: 20, alignItems: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.rust,
  },
  actionButtonActive: { backgroundColor: C.rust },
  actionButtonDisabled: { opacity: 0.4 },
  actionButtonText: { fontSize: 14, fontWeight: '600', color: C.rust },
  actionButtonTextActive: { color: C.card },

  chapterCard: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12 },
  chapterCardHidden: { opacity: 0.6, borderWidth: 1, borderStyle: 'dashed', borderColor: C.faint },
  chapterHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  chapterLabel: { fontSize: 12, fontWeight: '700', color: C.rustDark, flexShrink: 1, marginRight: 8 },
  chapterDate: { fontSize: 12, color: C.subtext },
  chapterPhotoStrip: {
    width: '100%', height: 140, borderRadius: 12, marginBottom: 8, backgroundColor: C.border,
  },
  chapterPhotoSquare: {
    width: '100%', aspectRatio: 1, borderRadius: 12, marginBottom: 8, backgroundColor: C.border,
  },
  chapterCaption: { fontSize: 13, fontWeight: '600', color: C.rustDark, textAlign: 'center' },
  chapterText: { fontSize: 15, color: C.text, lineHeight: 20 },
});
