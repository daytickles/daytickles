import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C, accentFor, darken, lighten, moodColorFor, moodDotSize, TICKLE_NATURE_ICONS } from '../lib/theme';
import { flagEmoji } from '../lib/country';

function formatEntryDate(entryDate) {
  return new Date(`${entryDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Must match this file's own entryCard.marginBottom below — exported so
// any caller doing its own height math (e.g. feed.js's FlatList
// getItemLayout) can't silently drift out of sync with the real value.
export const CARD_SPACING = 12;

// Extracted from feed.js's original renderEntry — same markup, same
// styles, same tab==='mine'-gated actions (now `showMineActions`), same
// confirm-before-delete flow. Handlers that mutate a list the caller
// owns (follow/favorite/like/visibility/delete) are callback props;
// edit navigation is self-contained since it's stateless push-only.
export default function EntryCard({
  item,
  currentUserId,
  showMineActions,
  isHighlighted,
  isFollowing,
  isFavorited,
  isLiked,
  taggedGoal,
  onLayout,
  onToggleFollow,
  onPickGoal,
  onShare,
  onToggleFavorite,
  onToggleVisibility,
  onDelete,
  onToggleLike,
}) {
  const accent = accentFor(item.profiles?.accent_theme);
  const isOwnEntry = item.user_id === currentUserId;
  const dotSize = moodDotSize(item.mood);

  function confirmDelete() {
    Alert.alert(
      'Delete this tickle?',
      "This can't be undone — it removes the entry everywhere, including any likes or shares.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(item) },
      ]
    );
  }

  return (
    <View
      style={[styles.entryCard, isHighlighted && styles.highlightedCard]}
      onLayout={onLayout}
    >
      <View style={styles.entryRow}>
        <View
          style={[
            styles.moodDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: moodColorFor(item.mood, accent),
            },
          ]}
        />
        <View style={styles.entryBody}>
          <View style={styles.headerRow}>
            <View style={styles.authorRow}>
              <Text style={styles.authorText} numberOfLines={1}>
                {item.profiles?.avatar_emoji} {item.profiles?.username}
                {item.profiles?.country ? `  ${flagEmoji(item.profiles.country)}` : ''}
              </Text>
              {!isOwnEntry && (
                <TouchableOpacity
                  onPress={() => onToggleFollow?.(item.user_id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.followAction}
                >
                  <Text style={[styles.followLink, isFollowing && styles.followLinkActive]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.iconGroup}>
              {item.tickle_nature && (
                <Ionicons
                  name={TICKLE_NATURE_ICONS[item.tickle_nature]}
                  size={16}
                  color={C.subtext}
                  style={styles.natureIcon}
                />
              )}
              {showMineActions && (
                <TouchableOpacity
                  onPress={() => onPickGoal?.(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View
                    style={[
                      styles.goalDot,
                      taggedGoal
                        ? {
                            backgroundColor: taggedGoal.achieved_at
                              ? lighten(taggedGoal.color, 0.6)
                              : taggedGoal.color,
                          }
                        : styles.goalDotEmpty,
                    ]}
                  >
                    {taggedGoal?.achieved_at && (
                      <Ionicons name="checkmark" size={10} color={darken(taggedGoal.color, 0.4)} />
                    )}
                  </View>
                </TouchableOpacity>
              )}
              {showMineActions && (
                <TouchableOpacity
                  onPress={() => onShare?.(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.shareAction}
                >
                  <Text style={styles.shareLink}>Share</Text>
                </TouchableOpacity>
              )}
              {showMineActions && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/create', params: { entryId: item.id } })}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.editAction}
                >
                  <Ionicons name="pencil-outline" size={16} color={C.subtext} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => onToggleFavorite?.(item.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.starAction}
              >
                <Text style={[styles.starIcon, isFavorited && styles.starIconActive]}>
                  {isFavorited ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
              {showMineActions && (
                <TouchableOpacity
                  onPress={() => onToggleVisibility?.(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.visibilityAction}
                >
                  <Ionicons
                    name={item.visibility === 'public' ? 'eye-outline' : 'eye-off-outline'}
                    size={16}
                    color={C.subtext}
                  />
                </TouchableOpacity>
              )}
              {showMineActions && (
                <TouchableOpacity
                  onPress={confirmDelete}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.deleteAction}
                >
                  <Ionicons name="trash-outline" size={16} color={C.rust} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={styles.entryText}>{item.text_content}</Text>
          <View style={styles.entryMetaRow}>
            <Text style={styles.entryDate}>
              {formatEntryDate(item.entry_date)}
              {item.visibility === 'public' && item.is_edited ? ' · (edited)' : ''}
            </Text>
            <View style={styles.entryMetaRight}>
              {!isOwnEntry && (
                <TouchableOpacity
                  onPress={() => onToggleLike?.(item.id)}
                  style={styles.likeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isLiked ? 'happy' : 'happy-outline'}
                    size={16}
                    color={isLiked ? C.amberBg : C.faint}
                  />
                  <Text style={[styles.likeCount, isLiked && styles.likeCountActive]}>{item.like_count || 0}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  entryCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: CARD_SPACING,
  },
  highlightedCard: {
    borderWidth: 1.5, borderColor: C.amberDark, backgroundColor: C.sparkleBg,
  },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  moodDot: { marginRight: 12, marginTop: 4 },
  entryBody: { flex: 1 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 8 },
  authorText: { fontSize: 13, fontWeight: '600', color: C.rustDark, flexShrink: 1 },
  followAction: { marginLeft: 10 },
  iconGroup: { flexDirection: 'row', alignItems: 'center' },
  natureIcon: { marginLeft: 12 },
  goalDot: {
    width: 16, height: 16, borderRadius: 8, marginLeft: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  goalDotEmpty: {
    backgroundColor: 'transparent', borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: C.faint,
  },
  shareAction: { marginLeft: 12 },
  editAction: { marginLeft: 12 },
  starAction: { marginLeft: 12 },
  visibilityAction: { marginLeft: 12 },
  deleteAction: { marginLeft: 12 },
  entryText: { fontSize: 15, color: C.text, lineHeight: 20 },

  entryMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
  },
  entryDate: { fontSize: 12, color: C.subtext },
  entryMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  followLink: { fontSize: 12, fontWeight: '600', color: C.rust },
  followLinkActive: { color: C.subtext },
  shareLink: { fontSize: 12, color: C.subtext, fontWeight: '600' },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeCount: { fontSize: 12, fontWeight: '600', color: C.faint },
  likeCountActive: { color: C.sparkleText },
  starIcon: { fontSize: 18, color: C.faint },
  starIconActive: { color: C.amberDark },
});
