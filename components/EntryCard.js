import { useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C, accentFor, darken, lighten, withAlpha, SAVED_ENTRY_DOT_SIZE, VIBE_COLORS, NATURE_LABELS, AWARD_TYPES, AWARD_BADGE_COLOR, AWARD_HAND_ICON, awardLabelFor } from '../lib/theme';
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

// Deterministic per-entry tilt for the photo-only Polaroid render below --
// same idea as PolaroidCard's own rotationFor, but string-safe since
// item.id here is a cloud tickle_entries uuid, not pinned_photos' numeric
// autoincrement id.
function rotationForId(id) {
  const str = String(id);
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return `${((sum % 5) - 2) * 1.5}deg`;
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
  photoUri,
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
  onRelinkPhoto,
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
  // A photo-only Tickle (migration 0055's entry_kind) has no text at
  // all -- its own photo IS the entry. photoUri is the caller's
  // already-resolved local file uri (or the entry's public media_url
  // for a non-owner viewer), falsy meaning "nothing to show right now"
  // -- covers both "never had a local link on this device" and "link
  // exists but the file's gone missing" identically, since the UI
  // response (owner: Relink; non-owner: unavailable) is the same either
  // way. See feed.js/calendar.js for how photoUri gets resolved.
  const isPhotoOnly = item.entry_kind === 'photo_only';
  // Local to this card, not lifted to feed.js/calendar.js -- each menu
  // only ever acts on its own item via props already passed down
  // (onToggleVisibility/onDelete/router push for edit), so there's
  // nothing a parent screen needs to coordinate across cards.
  const [menuOpen, setMenuOpen] = useState(false);
  // Journal entries render collapsed (4 lines) behind ruled-paper
  // texture until tapped open -- local to the card, same as menuOpen.
  const [journalExpanded, setJournalExpanded] = useState(false);
  // Tap-to-reveal on the public award badge below -- which distinct
  // award TYPE's popup is open (or null), not an index, since
  // publicAwardTypes is already deduped to distinct types. Same tap-to-
  // show/tap-again-to-dismiss/auto-hide-after-2s shape as Home's own
  // stat-pill tooltips (showStatTooltip).
  const [openAwardType, setOpenAwardType] = useState(null);
  const awardTooltipTimerRef = useRef(null);

  function showAwardTooltip(type) {
    if (awardTooltipTimerRef.current) clearTimeout(awardTooltipTimerRef.current);
    if (openAwardType === type) {
      setOpenAwardType(null);
      return;
    }
    setOpenAwardType(type);
    awardTooltipTimerRef.current = setTimeout(() => setOpenAwardType(null), 2000);
  }

  function confirmDelete() {
    Alert.alert(
      'Delete this tickle?',
      isPhotoOnly
        ? "This can't be undone — it removes the entry everywhere, including any likes or shares. The photo itself isn't deleted by this — it stays in your device gallery, and in Tickle Pics if it's still pinned there."
        : "This can't be undone — it removes the entry everywhere, including any likes or shares.",
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
        // Gated off entirely for isPhotoOnly, same reasoning as
        // photoOnlyCard below -- a colored stripe/wash implies a card
        // surface to color, and a photo-only entry deliberately has
        // none (the public award badge icon in the header row still
        // shows either way, unaffected by this).
        hasPublicAward && !isPhotoOnly && styles.publicAwardStripe,
        // Light wash + full border, same family as Goals/FM quest
        // card/Settings cards (withAlpha(color, 0.14) bg + colored
        // border). Additive alongside the stripe above -- different
        // style keys (borderColor/borderWidth vs borderLeft*), so the
        // stripe's own left-edge values are never touched. Gated on
        // !isJournal rather than relying on journalCard's later
        // ordering, since journalCard only overrides backgroundColor +
        // borderLeft -- an ungated wash would still leak its top/
        // right/bottom border through on an awarded journal entry.
        hasPublicAward && !isJournal && !isPhotoOnly && styles.awardWash,
        // Ordered last so a journal entry's own look always wins over a
        // legacy award stripe (award-giving is suppressed for journal
        // entries going forward, but a pre-existing award could still
        // be on one).
        isJournal && styles.journalCard,
        // Photo-only Tickles deliberately have no card surface at all
        // (spec: "sits as a standalone Polaroid object directly in the
        // feed, not inside the standard bordered card treatment every
        // other entry uses") -- drops entryCard's fill, the Polaroid
        // itself supplies its own white frame + shadow below. Ordered
        // last so it always wins over journalCard (mutually exclusive
        // in practice -- day_journal and photo_only are different
        // tickle_nature/entry_kind values -- but this keeps the
        // override explicit rather than relying on that never changing).
        isPhotoOnly && styles.photoOnlyCard,
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
              {/* Suppressed for a photo-only entry -- this icon means
                  "a photo is attached", which is redundant and
                  confusing on a card whose entire content already is
                  one; hasLinkedPhoto is also always true for its own
                  entry_id in this case anyway. */}
              {hasLinkedPhoto && !isPhotoOnly && (
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
                  doesn't. Each icon is independently tappable -- for a
                  multi-type badge, tapping one icon reveals only THAT
                  type's phrase, never a combined list, and never who
                  gave it (awarded_entries -- migration 0054 -- never
                  exposes giver identity, same privacy boundary here). */}
              {hasPublicAward && (
                <View style={styles.publicAwardBadge}>
                  {publicAwardTypes.map((type) => (
                    <View key={type} style={styles.awardBadgeIconWrap}>
                      <TouchableOpacity
                        onPress={() => showAwardTooltip(type)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name={AWARD_HAND_ICON} size={16} color={AWARD_TYPES[type].color} />
                      </TouchableOpacity>
                      {openAwardType === type && (
                        <View style={styles.awardTooltip} pointerEvents="none">
                          <Text style={styles.awardTooltipText}>{awardLabelFor(type, isPhotoOnly)}</Text>
                        </View>
                      )}
                    </View>
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
          {isPhotoOnly ? (
            // The Polaroid itself -- tilted, drop-shadowed, its own
            // white frame (see polaroidPhotoCard below), deliberately
            // NOT nested inside the standard bordered card (that's
            // dropped entirely for isPhotoOnly, see photoOnlyCard
            // above). Favorite/goal-tag/delete stay up in headerRow
            // above rather than in the Polaroid's own top strip the
            // spec describes -- an explicit, documented deviation on
            // the one point the spec itself calls not-yet-decided
            // ("may need reconsidering once actually built and seen for
            // real... decide after seeing it built"), traded for
            // reusing headerRow's already-working icons wholesale
            // instead of duplicating them. Revisit if it reads wrong in
            // practice.
            <TouchableOpacity
              activeOpacity={photoUri ? 0.85 : 1}
              onPress={() => photoUri && onOpenPhoto?.(item.id, photoUri)}
              style={[styles.polaroidPhotoCard, { transform: [{ rotate: rotationForId(item.id) }] }]}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.polaroidPhoto} />
              ) : (
                <View style={styles.polaroidMissingWrap}>
                  <Ionicons name="image-outline" size={26} color={C.faint} />
                  {isOwnEntry ? (
                    <>
                      <Text style={styles.polaroidMissingText} numberOfLines={1}>
                        {item.local_photo_filename || 'Photo missing'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => onRelinkPhoto?.(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.relinkButton}
                      >
                        <Text style={styles.relinkButtonText}>Relink photo</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Text style={styles.polaroidMissingText}>Photo not available</Text>
                  )}
                </View>
              )}
              {/* Caption shows the chosen Vibe's label instead of a
                  share caption, per spec. */}
              <View style={styles.polaroidCaptionStrip}>
                <Text style={styles.polaroidCaptionLabel}>{NATURE_LABELS[item.tickle_nature]}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <>
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
            </>
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
            {/* Deliberately absent for a photo-only entry -- there's no
                text to edit, and re-picking the Vibe as a kind of "edit"
                was raised but never resolved either way (see the spec's
                own open item on this), so this stays simply omitted
                rather than guessing at that behavior. */}
            {!isPhotoOnly && (
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
            )}

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
  photoOnlyCard: { backgroundColor: 'transparent', padding: 0 },
  // Same tilt+shadow language as PolaroidCard.js/ShareCard.js's own
  // Polaroid treatments (shadowOffset/Opacity/Radius/elevation values
  // copied from there for visual consistency) -- square photo, small
  // white frame, no card behind it (photoOnlyCard above already dropped
  // that). 75% of the row's width rather than PolaroidCard's fixed 150px
  // grid-card size (this sits alone in a single-column list, not a 2-up
  // grid) or a full-bleed 100% (read as too dominant against the rest of
  // the feed on-device) -- a first pass, easy to retune once seen live,
  // same as the icon-placement deviation noted above.
  polaroidPhotoCard: {
    width: '75%',
    alignSelf: 'center',
    backgroundColor: C.card,
    borderRadius: 8,
    padding: 8,
    paddingBottom: 6,
    marginTop: 4,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  polaroidPhoto: { width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: C.border },
  polaroidMissingWrap: {
    width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16,
  },
  polaroidMissingText: { fontSize: 12, color: C.subtext, textAlign: 'center' },
  relinkButton: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.sparkleBg,
  },
  relinkButtonText: { fontSize: 12, fontWeight: '600', color: C.sparkleText },
  polaroidCaptionStrip: { paddingTop: 8, paddingHorizontal: 2 },
  polaroidCaptionLabel: { fontSize: 13, fontWeight: '600', color: C.rustDark, textAlign: 'center' },
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
  awardBadgeIconWrap: { position: 'relative' },
  // Pops upward from the icon (same direction as Home's own stat-pill
  // tooltip) and is nudged left via the negative `right` offset so it
  // has a better chance of staying on-card for the rightmost icon in a
  // multi-type badge, which sits closest to the card's own right edge --
  // a first-pass placement with no real viewport-edge measurement behind
  // it, same tradeoff EntryCard's own Polaroid width comment already
  // accepted; retune if it clips on a real device.
  awardTooltip: {
    position: 'absolute', bottom: '100%', marginBottom: 6, right: -20,
    width: 170, alignItems: 'center',
  },
  awardTooltipText: {
    fontSize: 11, fontWeight: '600', color: C.bg, textAlign: 'center',
    backgroundColor: C.rustDark, borderRadius: 8, overflow: 'hidden',
    paddingVertical: 4, paddingHorizontal: 10,
  },
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
