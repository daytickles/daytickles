import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C, accentFor, darken, lighten, withAlpha, SAVED_ENTRY_DOT_SIZE, VIBE_COLORS, AWARD_TYPES, AWARD_BADGE_COLOR, AWARD_HAND_ICON } from '../lib/theme';
import { flagEmoji } from '../lib/country';
import InitialsAvatar from './InitialsAvatar';
import FoundingMemberBadge from './FoundingMemberBadge';
import NatureIcon from './NatureIcon';

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

// Heuristic for whether a journal entry's clamped-to-4-lines preview
// needs a "Continue reading" affordance -- see the entryText render
// site for why this is a char-count guess rather than a measured line
// count.
const JOURNAL_TRUNCATE_CHARS = 200;

// Generous upper bound of rule-line offsets for the ruled-paper texture
// (see journalTextWrap) -- covers the longest possible entry (MAX_LEN
// 500 in create.js); journalTextWrap's overflow:hidden clips the rest.
const JOURNAL_RULE_OFFSETS = Array.from({ length: 20 }, (_, i) => (i + 1) * 22);

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
  hasLinkedPhoto,
  awardType,
  publicAwardTypes,
  onLayout,
  onToggleFollow,
  onPickGoal,
  onShare,
  onToggleFavorite,
  onToggleVisibility,
  onDelete,
  onToggleLike,
  onOpenPhoto,
  onGiveAward,
}) {
  const accent = accentFor(item.profiles?.accent_theme);
  // Distinct award types this entry has actually received, from any
  // giver -- see migration 0054's awarded_entries view (public, but
  // never reveals who gave it, only which type(s)).
  const hasPublicAward = !!publicAwardTypes?.length;
  const isOwnEntry = item.user_id === currentUserId;
  // Day Journal is just tickle_nature === 'day_journal' (see migration
  // 0010) -- no new prop needed, item already carries it.
  const isJournal = item.tickle_nature === 'day_journal';
  // Local to this card, not lifted to feed.js/calendar.js -- each menu
  // only ever acts on its own item via props already passed down
  // (onToggleVisibility/onDelete/router push for edit), so there's
  // nothing a parent screen needs to coordinate across cards.
  const [menuOpen, setMenuOpen] = useState(false);
  // Journal entries render collapsed (4 lines) behind ruled-paper
  // texture until tapped open -- local to the card, same as menuOpen.
  const [journalExpanded, setJournalExpanded] = useState(false);

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
      style={[
        styles.entryCard,
        isHighlighted && styles.highlightedCard,
        // Ordered after highlightedCard so its left edge always wins --
        // a highlighted *and* awarded card should still show the gold
        // stripe, not have it swallowed by the highlight's own border.
        hasPublicAward && styles.publicAwardStripe,
        // Light wash + full border, same family as Goals/FM quest
        // card/Settings cards (withAlpha(color, 0.14) bg + colored
        // border). Additive alongside the stripe above -- different
        // style keys (borderColor/borderWidth vs borderLeft*), so the
        // stripe's own left-edge values are never touched. Gated on
        // !isJournal rather than relying on journalCard's later
        // ordering, since journalCard only overrides backgroundColor +
        // borderLeft -- an ungated wash would still leak its top/
        // right/bottom border through on an awarded journal entry.
        hasPublicAward && !isJournal && styles.awardWash,
        // Ordered last so a journal entry's own look always wins over a
        // legacy award stripe (award-giving is suppressed for journal
        // entries going forward, but a pre-existing award could still
        // be on one).
        isJournal && styles.journalCard,
      ]}
      onLayout={onLayout}
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
          {!!VIBE_COLORS[item.tickle_nature] && (
            <NatureIcon
              nature={item.tickle_nature}
              size={SAVED_ENTRY_DOT_SIZE}
              color={VIBE_COLORS[item.tickle_nature]}
            />
          )}
        </View>
        <View style={styles.entryBody}>
          <View style={styles.headerRow}>
            <View style={styles.authorRow}>
              <InitialsAvatar username={item.profiles?.username} accentTheme={item.profiles?.accent_theme} size={18} />
              <Text style={styles.authorText} numberOfLines={1}>
                {item.profiles?.username}
                {item.profiles?.country ? `  ${flagEmoji(item.profiles.country)}` : ''}
              </Text>
              {!!item.profiles?.founding_member_number && (
                <FoundingMemberBadge number={item.profiles.founding_member_number} />
              )}
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
              {isJournal && (
                // Deliberately not added to TICKLE_NATURE_ICONS/NatureIcon --
                // calendar.js's month-grid keys off "no TICKLE_NATURE_ICONS
                // entry" to keep Day Journal out of the Vibes category dots
                // (see its own comment at the natureCategories build site).
                // Doing it there would silently pull journal entries into
                // Vibes categorization on the calendar grid.
                //
                // The non-journal branch that used to render a second,
                // plain-grey NatureIcon here was removed -- it duplicated
                // the colored vibe icon in the entry row's icon slot.
                <Ionicons name="journal-outline" size={16} color={C.subtext} style={styles.natureIcon} />
              )}
              {hasLinkedPhoto && (
                <TouchableOpacity
                  onPress={() => onOpenPhoto?.(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.photoAction}
                >
                  <Ionicons name="image-outline" size={16} color={C.subtext} />
                </TouchableOpacity>
              )}
              {/* Public "this post received recognition" badge -- one
                  hand icon per distinct award type the entry has
                  actually received, from any giver, each colored per
                  that type. Shown to everyone, on any awarded post,
                  including the owner's own. Deliberately reveals which
                  type(s) were given (2026-08-29 product decision) --
                  see AWARD_BADGE_COLOR in lib/theme.js for why the
                  card's stripe/wash stays generic while this icon
                  doesn't. */}
              {hasPublicAward && (
                <View style={styles.publicAwardBadge}>
                  {publicAwardTypes.map((type) => (
                    <Ionicons key={type} name={AWARD_HAND_ICON} size={16} color={AWARD_TYPES[type].color} />
                  ))}
                </View>
              )}
              {showMineActions && !isJournal && (
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
              {showMineActions && !isJournal && (
                <TouchableOpacity
                  onPress={() => onShare?.(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.shareAction}
                >
                  <Text style={styles.shareLink}>Share</Text>
                </TouchableOpacity>
              )}
              {!isJournal && (
                <TouchableOpacity
                  onPress={() => onToggleFavorite?.(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.starAction}
                >
                  <Text style={[styles.starIcon, isFavorited && styles.starIconActive]}>
                    {isFavorited ? '★' : '☆'}
                  </Text>
                </TouchableOpacity>
              )}
              {/* Give-High-Five CTA -- shown only while the viewer
                  hasn't given their own award yet. Once they have
                  (awardType truthy), this element is dropped entirely
                  rather than swapped for a duplicate colored icon here:
                  the public badge above (hasPublicAward) already
                  renders a colored hand icon for that exact type, now
                  that award_type is public (migration 0054) -- a
                  second, visually identical icon here was pure
                  redundant clutter. Awarding your own entry is blocked
                  -- both here client-side and server-side via migration
                  0020's prevent_self_award trigger, same defense-in-
                  depth shape as the Like button's own !isOwnEntry gate
                  further down this file. Journal entries suppress
                  award-giving entirely, same as the favorite star above. */}
              {!isJournal && isFavorited && !isOwnEntry && !awardType && (
                <TouchableOpacity
                  onPress={() => onGiveAward?.(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.awardAction}
                >
                  <Ionicons name="hand-right-outline" size={16} color={C.faint} />
                </TouchableOpacity>
              )}
              {/* Edit/visibility/delete used to each be their own inline
                  icon -- collapsed into this single menu (see the Modal
                  below) once the row started overflowing the screen's
                  right edge on Mine-tab/Calendar cards, the three most
                  crowded showMineActions icons combined with the new
                  public award badge being what tipped it over. Goal tag,
                  Share, and Favorite stay inline as the higher-frequency
                  actions. */}
              {showMineActions && (
                <TouchableOpacity
                  onPress={() => setMenuOpen(true)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.moreAction}
                >
                  <Ionicons name="ellipsis-vertical" size={16} color={C.subtext} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={isJournal ? styles.journalTextWrap : undefined}>
            {isJournal && (
              // Fixed, generous upper bound (covers the longest possible
              // entry at MAX_LEN=500) -- the wrap's own overflow:hidden
              // clips extra lines to the text's real rendered height, so
              // no onLayout/measurement pass is needed.
              <View style={styles.journalRuleLines} pointerEvents="none">
                {JOURNAL_RULE_OFFSETS.map((top) => (
                  <View key={top} style={[styles.journalRuleLine, { top }]} />
                ))}
              </View>
            )}
            <Text
              style={[styles.entryText, isJournal && styles.journalEntryText]}
              numberOfLines={isJournal && !journalExpanded ? 4 : undefined}
            >
              {item.text_content}
            </Text>
          </View>
          {isJournal && !journalExpanded && item.text_content.length > JOURNAL_TRUNCATE_CHARS && (
            <TouchableOpacity
              onPress={() => setJournalExpanded(true)}
              hitSlop={{ top: 6, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.continueReadingLink}>Continue reading</Text>
            </TouchableOpacity>
          )}
          <View style={styles.entryMetaRow}>
            <Text style={styles.entryDate}>
              {formatEntryDate(item.entry_date)}
              {item.visibility === 'public' && item.is_edited ? ' · (edited)' : ''}
            </Text>
            <View style={styles.entryMetaRight}>
              {!isJournal && !isOwnEntry && (
                <TouchableOpacity
                  onPress={() => onToggleLike?.(item.id)}
                  style={styles.likeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
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

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.menuSheet} onPress={() => {}}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setMenuOpen(false);
                router.push({ pathname: '/create', params: { entryId: item.id } });
              }}
            >
              <Ionicons name="pencil-outline" size={18} color={C.text} />
              <Text style={styles.menuRowLabel}>Edit</Text>
            </TouchableOpacity>

            {!isJournal && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  onToggleVisibility?.(item);
                }}
              >
                <Ionicons
                  name={item.visibility === 'public' ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={C.text}
                />
                <Text style={styles.menuRowLabel}>
                  {item.visibility === 'public' ? 'Make private' : 'Make public'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setMenuOpen(false);
                confirmDelete();
              }}
            >
              <Ionicons name="trash-outline" size={18} color={C.rust} />
              <Text style={[styles.menuRowLabel, styles.menuRowLabelDestructive]}>Delete</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  entryCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: CARD_SPACING,
  },
  journalCard: {
    // C.bg is the exact color WallpaperBackground paints as its own
    // base layer -- an opaque journalCard in that color was literally
    // invisible against the page. Lightened + alpha'd instead, so the
    // wallpaper's cream/texture shows through faintly while the card
    // still reads as a distinct surface.
    backgroundColor: withAlpha(lighten(C.bg, 0.6), 0.55), borderLeftWidth: 4, borderLeftColor: C.rustDark,
  },
  journalTextWrap: { position: 'relative', overflow: 'hidden' },
  journalRuleLines: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  journalRuleLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: C.border },
  journalEntryText: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', lineHeight: 22,
  },
  continueReadingLink: { fontSize: 12, fontWeight: '600', color: C.rust, marginTop: 4 },
  highlightedCard: {
    borderWidth: 1.5, borderColor: C.amberDark, backgroundColor: C.sparkleBg,
  },
  publicAwardStripe: {
    borderLeftWidth: 4, borderLeftColor: AWARD_BADGE_COLOR,
  },
  awardWash: {
    backgroundColor: withAlpha(AWARD_BADGE_COLOR, 0.14), borderWidth: 1, borderColor: AWARD_BADGE_COLOR,
  },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  vibeIconSlot: { marginRight: 12, marginTop: 4 },
  entryBody: { flex: 1 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 8, gap: 6 },
  authorText: { fontSize: 13, fontWeight: '600', color: C.rustDark, flexShrink: 1 },
  followAction: { marginLeft: 10 },
  iconGroup: { flexDirection: 'row', alignItems: 'center' },
  natureIcon: { marginLeft: 12 },
  photoAction: { marginLeft: 12 },
  publicAwardBadge: { flexDirection: 'row', alignItems: 'center', marginLeft: 12, gap: 4 },
  goalDot: {
    width: 16, height: 16, borderRadius: 8, marginLeft: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  goalDotEmpty: {
    backgroundColor: 'transparent', borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: C.faint,
  },
  shareAction: { marginLeft: 12 },
  starAction: { marginLeft: 12 },
  awardAction: { marginLeft: 12 },
  moreAction: { marginLeft: 12 },
  menuBackdrop: {
    flex: 1, backgroundColor: 'rgba(44,44,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  menuSheet: {
    width: '100%', maxWidth: 280, backgroundColor: C.card, borderRadius: 18, padding: 8,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
  },
  menuRowLabel: { fontSize: 15, color: C.text },
  menuRowLabelDestructive: { color: C.rust },
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
