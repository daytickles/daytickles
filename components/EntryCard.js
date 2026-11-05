import { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Modal, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C, darken, lighten, withAlpha, vibeIconColor, NATURE_LABELS, AWARD_BADGE_COLOR } from '../lib/theme';
import { showAlert } from '../lib/themedAlert';
import { isQuickTickle, useTickleItDismissed } from '../lib/quickTickle';
import { flagEmoji } from '../lib/country';
import InitialsAvatar from './InitialsAvatar';
import FoundingMemberBadge from './FoundingMemberBadge';
import NatureIcon from './NatureIcon';
import AwardBadges from './AwardBadges';
import { BUTTON_HEIGHT, BUTTON_HIT_SLOP, BUTTON_RADIUS } from '../lib/buttonSize';
import { DECK_COLORS, DECK_TEXT } from './HomeDeck';

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

// "Added to Tickle Pics around 12:29 pm on 18 Sep 2026" from a Tickle
// Pics filename. The number it starts with is Date.now() at the moment the
// photo was added to Tickle Pics (lib/pinBoardPhotos.js
// saveAssetToPinBoard), not when its gallery copy was made. Device locale
// for the time and date. null when the name doesn't start that way or the
// date is implausible (before 2020 or in the future).
function savedAroundText(filename) {
  const match = /^(\d{13})-/.exec(filename || '');
  if (!match) return null;
  const ms = Number(match[1]);
  if (ms < Date.UTC(2020, 0, 1) || ms > Date.now()) return null;
  // Nearest minute, so 12:28:59.8 reads 12:29.
  const saved = new Date(Math.round(ms / 60000) * 60000);
  const time = saved.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const date = saved.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `Added to Tickle Pics around ${time} on ${date}`;
}

// Must match this file's own entryCard.marginBottom below — exported so
// any caller doing its own height math (e.g. feed.js's FlatList
// getItemLayout) can't silently drift out of sync with the real value.
export const CARD_SPACING = 12;

// Dusk blue for the card's Quick Tickle mark and its "Tickle it" pill
// (Task 3 Q2) -- fixed, not the viewer's accent theme any more.
const INK = '#425762';
// Restyled card (Task 3 S3): warm white, a 1dp sand border, radius 22.
const CARD_FILL = '#FFFDF7';
const CARD_LINE = '#EADFCB';
const VIBE_ICON_SIZE = 16;
// Link row (star, likes, Share, Goal, Ripple / High Five hand, ⋯): each
// control is LINK_TARGET_HEIGHT tall, and LINK_HIT_SLOP adds 6dp above
// and below so the tap area stays 44dp tall. The bottom slop stays
// inside the card's 14dp padding.
const LINK_TARGET_HEIGHT = 32;
const LINK_HIT_SLOP = { top: 6, bottom: 6 };

// Extracted from feed.js's original renderEntry — same markup, same
// styles, same tab==='mine'-gated actions (now `showMineActions`), same
// confirm-before-delete flow. Handlers that mutate a list the caller
// owns (follow/favorite/like/visibility/delete) are callback props;
// edit navigation is self-contained since it's stateless push-only.
export default function EntryCard({
  item,
  currentUserId,
  showMineActions,
  // false hides the author row (avatar, name, flag, Moji number) --
  // Tickle Stash's Mine tab, where every post is your own (Task 3 S4).
  showAuthor = true,
  isHighlighted,
  isFollowing,
  isFavorited,
  isLiked,
  taggedGoal,
  taleBadge,
  hasLinkedPhoto,
  photoUri,
  awardType,
  publicAwardTypes,
  onLayout,
  onToggleFollow,
  onPickGoal,
  onPickTale,
  onShare,
  onToggleFavorite,
  onToggleVisibility,
  onDelete,
  onToggleLike,
  onOpenPhoto,
  onRelinkPhoto,
  onGiveAward,
}) {
  // Distinct award types this entry has actually received, from any
  // giver -- see migration 0054's awarded_entries view (public, but
  // never reveals who gave it, only which type(s)).
  const hasPublicAward = !!publicAwardTypes?.length;
  const isOwnEntry = item.user_id === currentUserId;
  // A photo-only Tickle (migration 0055's entry_kind) has no text at
  // all -- its own photo IS the entry. photoUri is the caller's
  // already-resolved local file uri (or the entry's public media_url
  // for a non-owner viewer), falsy meaning "nothing to show right now"
  // -- covers both "never had a local link on this device" and "link
  // exists but the file's gone missing" identically, since the UI
  // response (owner: Relink; non-owner: unavailable) is the same either
  // way. See feed.js/calendar.js for how photoUri gets resolved.
  const isPhotoOnly = item.entry_kind === 'photo_only';
  // The Polaroid is only tappable (to enlarge) when there's a photo.
  const PolaroidFrame = photoUri ? TouchableOpacity : View;
  // Local to this card, not lifted to feed.js/calendar.js -- each menu
  // only ever acts on its own item via props already passed down
  // (onToggleVisibility/onDelete/router push for edit), so there's
  // nothing a parent screen needs to coordinate across cards.
  const [menuOpen, setMenuOpen] = useState(false);
  // A Quick Tickle (lib/quickTickle.js): the owner's own text-less,
  // photo-less Tickle. Its body is a QT dot plus a "Tickle it" pill
  // (dismissable per phone); Ripple and Share stay hidden until it has
  // words. Only the owner ever sees this treatment.
  const isQuick = isOwnEntry && isQuickTickle(item, !!photoUri || !!hasLinkedPhoto);
  const likeCount = item.like_count || 0;
  const [tickleItDismissed, dismissTickleIt] = useTickleItDismissed(item.id, isQuick && showMineActions);

  function openEdit() {
    router.push({ pathname: '/create', params: { entryId: item.id } });
  }

  function confirmDelete() {
    // The public-copy sentence only applies once there's actually a
    // public copy to remove -- a private photo-only entry never had
    // anything uploaded (see lib/photoTickleStorage.js's own media_url
    // gate), so nothing would be true to say there.
    const photoOnlyMessage =
      "This can't be undone — it removes the entry everywhere, including any likes or shares. The photo itself isn't deleted by this — it stays in your device gallery, and in Tickle Pics if it's still pinned there." +
      (item.visibility === 'public' ? ' The shared copy is removed too.' : '');
    showAlert(
      'Delete this Tickle?',
      isPhotoOnly
        ? photoOnlyMessage
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
        // stripe's own left-edge values are never touched. My Day is a
        // regular Tickle for award purposes now -- no isJournal gate.
        hasPublicAward && !isPhotoOnly && styles.awardWash,
        // Photo-only Tickles deliberately have no card surface at all
        // (spec: "sits as a standalone Polaroid object directly in the
        // feed, not inside the standard bordered card treatment every
        // other entry uses") -- drops entryCard's fill, the Polaroid
        // itself supplies its own white frame + shadow below.
        isPhotoOnly && styles.photoOnlyCard,
      ]}
      onLayout={onLayout}
    >
      {/* Author row: who posted it. The username is the only thing that
          shrinks -- the flag and Moji badge sit beside it as non-shrinking
          siblings, so a long name truncates without clipping the flag. */}
      {showAuthor && (
        <View style={styles.authorRow}>
          <InitialsAvatar username={item.profiles?.username} accentTheme={item.profiles?.accent_theme} size={18} />
          <Text style={styles.authorText} numberOfLines={1}>
            {item.profiles?.username}
          </Text>
          {!!item.profiles?.country && (
            <Text style={styles.authorFlag}>{flagEmoji(item.profiles.country)}</Text>
          )}
          {!!item.profiles?.founding_member_number && (
            <FoundingMemberBadge number={item.profiles.founding_member_number} compact />
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
      )}
      {/* Header: the Vibe's icon in a soft circle and its name on the left,
          the date on the right. One icon for all four natures, My Day's
          sun included (TICKLE_NATURE_ICONS / vibeIconColor in
          lib/theme.js); an untagged (null) entry shows no Vibe. The public
          "this post received recognition" badges (components/
          AwardBadges.js) follow the Vibe name. */}
      <View style={styles.headerRow}>
        <View style={styles.vibeHeader}>
          {!!item.tickle_nature && (
            <>
              <View style={[styles.vibeCircle, { backgroundColor: withAlpha(vibeIconColor(item.tickle_nature), 0.12) }]}>
                <NatureIcon
                  nature={item.tickle_nature}
                  size={VIBE_ICON_SIZE}
                  color={vibeIconColor(item.tickle_nature)}
                />
              </View>
              <Text style={styles.vibeName} numberOfLines={1}>{NATURE_LABELS[item.tickle_nature]}</Text>
            </>
          )}
          {hasPublicAward && <AwardBadges types={publicAwardTypes} style={styles.publicAwardBadge} />}
        </View>
        <Text style={styles.entryDate}>
          {formatEntryDate(item.entry_date)}
          {item.visibility === 'public' && item.is_edited ? ' · (edited)' : ''}
        </Text>
      </View>
      {/* TickleTale chip (migration 0067) -- its own full-width
          line under the header. Shown to
          everyone who can see the entry; taleBadge comes from
          lib/tales.js's fetchTaleBadges. chapterNumber is null only
          for the owner's own tagged-but-private entry (nobody else
          can see that row), which isn't a numbered chapter until
          it's Rippled again. */}
      {!!taleBadge && (
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/tale', params: { id: taleBadge.taleId } })}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={styles.taleChip}
          accessibilityRole="button"
          accessibilityLabel={`${taleBadge.title}, Blogbit${taleBadge.chapterNumber == null ? ', not Rippled' : ''}${taleBadge.completed ? ', complete' : ''}`}
        >
          <Ionicons name={taleBadge.icon} size={12} color={DECK_TEXT} />
          <Text style={styles.taleChipTitle} numberOfLines={1}>{taleBadge.title}</Text>
          {taleBadge.chapterNumber == null && <Text style={styles.taleChipMeta}>· not Rippled</Text>}
          {taleBadge.completed && <Ionicons name="checkmark-circle" size={12} color={DECK_TEXT} />}
        </TouchableOpacity>
      )}
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
        // A plain View when the photo is missing: a selectable Text
        // nested under a touchable never gets the long-press on
        // Android (the touchable takes the touch first).
        <PolaroidFrame
          {...(photoUri ? { activeOpacity: 0.85, onPress: () => onOpenPhoto?.(item.id, photoUri) } : {})}
          style={[styles.polaroidPhotoCard, { transform: [{ rotate: rotationForId(item.id) }] }]}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.polaroidPhoto} />
          ) : (
            // Square at minimum, taller only when the stack below needs
            // it: the zero-width sizer's percentage padding is a share
            // of the wrap's width, so it holds the row at least that
            // tall, and the content beside it can still push past it
            // (aspectRatio alone would let the stack overflow).
            <View style={styles.polaroidMissingWrap}>
              <View style={styles.polaroidMissingSizer} />
              <View style={styles.polaroidMissingContent}>
                <Ionicons name="image-outline" size={26} color={C.faint} />
                {isOwnEntry ? (
                  <>
                    {/* The filename finds the auto-saved gallery copy before
                        Relinking. Long-press selects it; "Copy name" opens the
                        share sheet (which has Copy) as the dependable route,
                        since there's no clipboard module in this build. */}
                    <Text style={styles.polaroidMissingText} selectable>
                      {item.local_photo_filename || 'Photo missing'}
                    </Text>
                    {!!savedAroundText(item.local_photo_filename) && (
                      <Text style={styles.polaroidMissingHint}>
                        {savedAroundText(item.local_photo_filename)}
                      </Text>
                    )}
                    {/* With a name: copy it, then search for it in the
                        file picker (which has a search box), or else
                        browse the photo grid (which doesn't). */}
                    <View style={styles.missingActionsStack}>
                      {!!item.local_photo_filename && (
                        <>
                          <TouchableOpacity
                            onPress={() => Share.share({ message: item.local_photo_filename }).catch(() => {})}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.relinkButton}
                            accessibilityRole="button"
                            accessibilityLabel="Copy file name"
                          >
                            <Text style={styles.relinkButtonText}>Copy name</Text>
                          </TouchableOpacity>
                          <Text style={styles.missingStepText}>then</Text>
                          <TouchableOpacity
                            onPress={() => onRelinkPhoto?.(item, 'byName')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.relinkButton}
                            accessibilityRole="button"
                            accessibilityLabel="Find photo by name"
                          >
                            <Text style={styles.relinkButtonText}>Find by name</Text>
                          </TouchableOpacity>
                          <Text style={styles.missingSearchHint}>
                            Paste the name into the search box at the top.
                          </Text>
                          <Text style={styles.missingStepText}>or</Text>
                        </>
                      )}
                      <TouchableOpacity
                        onPress={() => onRelinkPhoto?.(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.relinkButton}
                        accessibilityRole="button"
                        accessibilityLabel="Find photo visually"
                      >
                        <Text style={styles.relinkButtonText}>Visual find</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <Text style={styles.polaroidMissingText}>Photo not available</Text>
                )}
              </View>
            </View>
          )}
          {/* Caption shows the chosen Vibe's label instead of a
              share caption, per spec. */}
          <View style={styles.polaroidCaptionStrip}>
            <Text style={styles.polaroidCaptionLabel}>{NATURE_LABELS[item.tickle_nature]}</Text>
          </View>
        </PolaroidFrame>
      ) : (
        <>
          {/* My Day entries used to render behind a ruled-paper
              texture, clamped to 4 lines with a "Continue reading"
              expand -- both removed now that My Day is a regular
              Tickle in every way. Plain, fully untruncated
              text_content, same as every other entry type already
              gets here. */}
          {isQuick ? (
            <View style={styles.quickRow}>
              <View
                style={styles.quickDot}
                accessible
                accessibilityLabel="Quick Tickle"
              >
                {/* Capped like GoalTargetCircle's count, so "QT" stays inside the fixed 28dp circle. */}
                <Text style={styles.quickDotLabel} maxFontSizeMultiplier={1.3}>QT</Text>
              </View>
              {showMineActions && tickleItDismissed === false && (
                <>
                  <TouchableOpacity
                    onPress={openEdit}
                    hitSlop={BUTTON_HIT_SLOP}
                    style={styles.tickleItPill}
                    accessibilityRole="button"
                    accessibilityLabel="Tickle it"
                  >
                    <Text style={styles.tickleItLabel}>Tickle it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={dismissTickleIt}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.tickleItDismiss}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss Tickle it for this Quick Tickle"
                  >
                    <Ionicons name="close" size={14} color={C.subtext} />
                  </TouchableOpacity>
                </>
              )}
              {/* Once "Tickle it" has been dismissed, a plain label in
                  its place: text only, not pressable. */}
              {showMineActions && tickleItDismissed === true && (
                <Text style={[styles.entryDate, styles.quickLabel]}>Quick Tickled!</Text>
              )}
            </View>
          ) : (
            <Text style={styles.entryText}>{item.text_content}</Text>
          )}
          {/* Below the text (Task 3 S3). Tickle-a-Photo display change --
              a linked photo that
              came from the "Tickle" button on a Tickle Pics photo
              (create.js's pinnedPhotoId flow is the only path that
              links a photo to an entry_kind='text' entry). Gated on
              photoUri alone, same as isPhotoOnly's own Polaroid
              branch above -- NOT additionally on hasLinkedPhoto,
              which is the viewer's own local-device Pin Board link
              and can never be true for anyone but the linking
              device/account. Once the upload-on-Ripple mechanic
              populated media_url for entry_kind='text' too,
              resolveLinkedPhotoUris (feed.js/calendar.js) already
              resolves photoUri correctly for a non-owner or a
              second device via that fallback -- gating on
              hasLinkedPhoto on top of that was a real bug (found and
              confirmed live cross-account, see
              ripple_photo_cross_account_bug_findings.md), not a
              deliberate restriction: it silently blocked the strip
              for every viewer except the one device that created the
              link, even once a perfectly valid photoUri existed.
              Deliberately its own plainer style, not isPhotoOnly's
              Polaroid treatment -- full-width strip, no white
              border/rotation/caption. Height/proportions are a first
              pass, flagged in the spec as needing a real-device
              look. */}
          {!!photoUri && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onOpenPhoto?.(item.id, photoUri)}
              style={styles.linkedPhotoStrip}
            >
              <Image source={{ uri: photoUri }} style={styles.linkedPhotoStripImage} />
            </TouchableOpacity>
          )}
        </>
      )}
      {/* A thin line, then the link row. Not on a photo-only Tickle,
          which has no card surface for it to divide. */}
      {!isPhotoOnly && <View style={styles.linkDivider} />}
      {/* Link row (Task 3 S5): star, likes and share on the left; then
          Ripple and the ⋯ menu on the right, ⋯ at the far edge. Every
          control is a 44dp target with its own label. At a large font
          scale the right group wraps under the left one rather than
          running off the card. */}
      <View style={styles.linkRow}>
        <View style={styles.linkGroup}>
          <TouchableOpacity
            onPress={() => onToggleFavorite?.(item.id)}
            hitSlop={LINK_HIT_SLOP}
            style={styles.linkTarget}
            accessibilityRole="button"
            accessibilityLabel={isFavorited ? 'Remove star' : 'Star this Tickle'}
            accessibilityState={{ selected: !!isFavorited }}
          >
            <Text style={[styles.starIcon, isFavorited && styles.starIconActive]}>
              {isFavorited ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
          {/* Likes, with their count. Never on your own Tickle -- the
              self-like guard, backed server-side by migration 0006's
              prevent_self_like_insert trigger. */}
          {!isOwnEntry && (
            <TouchableOpacity
              onPress={() => onToggleLike?.(item.id)}
              hitSlop={LINK_HIT_SLOP}
              style={[styles.linkTarget, styles.likeButton]}
              accessibilityRole="button"
              accessibilityLabel={`${isLiked ? 'Unlike' : 'Like'}, ${likeCount} like${likeCount === 1 ? '' : 's'}`}
              accessibilityState={{ selected: !!isLiked }}
            >
              <Ionicons
                name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                size={16}
                color={isLiked ? C.amberBg : C.faint}
              />
              <Text style={[styles.likeCount, isLiked && styles.likeCountActive]}>{likeCount}</Text>
            </TouchableOpacity>
          )}
          {/* Share, the same as the ⋯ menu's Share: only on your own
              Tickles (Mine and Calendar), and hidden for a Quick Tickle --
              it has no words to share yet. */}
          {showMineActions && !isQuick && (
            <TouchableOpacity
              onPress={() => onShare?.(item.id)}
              hitSlop={LINK_HIT_SLOP}
              style={styles.linkTarget}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <Ionicons name="share-outline" size={18} color={C.subtext} />
            </TouchableOpacity>
          )}
          {/* "YOUR local Tickle Pics link exists for this entry, but
              nothing resolved to show for it" -- owner-only, since
              hasLinkedPhoto is the viewer's own local link table. Not on a
              photo-only entry (its whole content already is the photo),
              and not once photoUri resolves (the photo shows above). Opens
              PhotoEnlargeModal. */}
          {hasLinkedPhoto && !isPhotoOnly && !photoUri && (
            <TouchableOpacity
              onPress={() => onOpenPhoto?.(item.id)}
              hitSlop={LINK_HIT_SLOP}
              style={styles.linkTarget}
              accessibilityRole="button"
              accessibilityLabel="Open linked photo"
            >
              <Ionicons name="image-outline" size={16} color={C.subtext} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.linkGroup}>
          {/* Goal tag (Mine and Calendar): filled with the Goal's colour,
              dashed when untagged, a tick once that Goal is achieved. */}
          {showMineActions && (
            <TouchableOpacity
              onPress={() => onPickGoal?.(item.id)}
              hitSlop={LINK_HIT_SLOP}
              style={styles.linkTarget}
              accessibilityRole="button"
              accessibilityLabel={taggedGoal ? `Goal: ${taggedGoal.label}. Change Goal` : 'Tag to a Goal'}
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
          {/* Ripple / Un-Ripple. Hidden for a private Quick Tickle: a
              text-less Ripple would be a blank public card. Un-Ripple
              always stays. */}
          {showMineActions && !(isQuick && item.visibility !== 'public') && (
            <TouchableOpacity
              onPress={() => onToggleVisibility?.(item)}
              hitSlop={LINK_HIT_SLOP}
              style={[styles.linkTarget, styles.labelAction]}
              accessibilityRole="button"
              accessibilityLabel={item.visibility === 'public' ? 'Un-Ripple' : 'Ripple'}
            >
              <Ionicons name="eye-outline" size={16} color={INK} />
              <Text style={styles.labelActionText} maxFontSizeMultiplier={1.5}>
                {item.visibility === 'public' ? 'Un-Ripple' : 'Ripple'}
              </Text>
            </TouchableOpacity>
          )}
          {/* Give-High-Five CTA (Task 3 S6): its hand icon alone (the
              spoken label says "Give a high five"), in dusk blue, the
              same 44dp icon box as Share and the menu, where Ripple sits
              on your own Tickles -- the
              two never show together (High Five needs someone else's
              Tickle, Ripple your own). Shown on every Rippled (public)
              Tickle of someone else's -- no star needed -- while you
              haven't given your own award yet (once you have, the
              public badge in the header already shows that type's
              coloured hand; one High Five per person per post).
              Never on your own entry -- blocked here and server-side by
              migration 0020's prevent_self_award trigger, the same
              defence-in-depth shape as the like button's !isOwnEntry
              gate. My Day entries are eligible, like any Tickle. */}
          {!isOwnEntry && !awardType && item.visibility === 'public' && (
            <TouchableOpacity
              onPress={() => onGiveAward?.(item.id)}
              hitSlop={LINK_HIT_SLOP}
              style={styles.linkTarget}
              accessibilityRole="button"
              accessibilityLabel="Give a high five"
            >
              <Ionicons name="hand-right-outline" size={16} color={INK} />
            </TouchableOpacity>
          )}
          {/* Edit / Multickle / Share / Delete live in this menu (the
              Modal below); always the last control, at the far right. */}
          {showMineActions && (
            <TouchableOpacity
              onPress={() => setMenuOpen(true)}
              hitSlop={LINK_HIT_SLOP}
              style={styles.linkTarget}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-vertical" size={16} color={C.subtext} />
            </TouchableOpacity>
          )}
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
                  openEdit();
                }}
              >
                <Ionicons name="pencil-outline" size={18} color={C.text} />
                <Text style={styles.menuRowLabel}>Edit</Text>
              </TouchableOpacity>
            )}

            {/* Tagging only applies to Ripples, but an already-tagged
                entry keeps its tag across Un-Ripple, so it stays
                reachable then too -- TaleTagModal itself only offers
                "Remove" for a private entry. */}
            {(item.visibility === 'public' || !!item.tale_id) && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  onPickTale?.(item.id);
                }}
              >
                {/* Change shows the tagged Multickle's own icon; Add has
                    no Multickle yet, so it keeps the generic book. */}
                <Ionicons
                  name={item.tale_id && taleBadge ? taleBadge.icon : 'book-outline'}
                  size={18}
                  color={C.text}
                />
                <Text style={styles.menuRowLabel}>{item.tale_id ? 'Change Blogbit…' : 'Add to a Blogbit…'}</Text>
              </TouchableOpacity>
            )}

            {/* Hidden for a Quick Tickle -- it has no words to share yet. */}
            {!isQuick && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  onShare?.(item.id);
                }}
              >
                <Ionicons name="share-outline" size={18} color={C.text} />
                <Text style={styles.menuRowLabel}>Share</Text>
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
    backgroundColor: CARD_FILL, borderRadius: 22, borderWidth: 1, borderColor: CARD_LINE,
    padding: 14, marginBottom: CARD_SPACING,
    shadowColor: '#4A1F10', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  // No surface, border or shadow -- the Polaroid supplies its own.
  photoOnlyCard: {
    backgroundColor: 'transparent', padding: 0, borderWidth: 0, shadowOpacity: 0, elevation: 0,
  },
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
    width: '100%', flexDirection: 'row', borderRadius: 4, backgroundColor: C.bg,
  },
  polaroidMissingSizer: { width: 0, paddingTop: '100%' },
  polaroidMissingContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16,
  },
  // Full width of the holder (less a little padding) so a long filename
  // or "Added to Tickle Pics around…" line wraps, centred, rather than
  // being cut off.
  polaroidMissingText: {
    alignSelf: 'stretch', paddingHorizontal: 4, fontSize: 12, color: C.subtext, textAlign: 'center',
  },
  // Sits close under the filename (the content's gap is 8).
  polaroidMissingHint: {
    alignSelf: 'stretch', paddingHorizontal: 4, fontSize: 11, color: C.subtext, textAlign: 'center', marginTop: -6,
  },
  missingActionsStack: { alignItems: 'center', gap: 4 },
  missingStepText: { fontSize: 11, color: C.subtext, textAlign: 'center' },
  // Tucked under Find by name, the step it explains.
  missingSearchHint: { fontSize: 11, color: C.subtext, textAlign: 'center', marginTop: -2 },
  // The app-wide pill height (lib/buttonSize.js); its own 8dp hitSlop
  // (set inline) already makes the tap area more than 44dp.
  relinkButton: {
    minHeight: BUTTON_HEIGHT, justifyContent: 'center', paddingHorizontal: 14, borderRadius: BUTTON_RADIUS,
    backgroundColor: C.sparkleBg,
  },
  relinkButtonText: { fontSize: 12, fontWeight: '600', color: C.sparkleText },
  polaroidCaptionStrip: { paddingTop: 8, paddingHorizontal: 2 },
  polaroidCaptionLabel: { fontSize: 13, fontWeight: '600', color: C.rustDark, textAlign: 'center' },
  highlightedCard: {
    borderWidth: 1.5, borderColor: C.amberDark, backgroundColor: C.sparkleBg,
  },
  publicAwardStripe: {
    borderLeftWidth: 4, borderLeftColor: AWARD_BADGE_COLOR,
  },
  // See-through, so no shadow: on Android an elevation shadow shows
  // through a translucent fill as a grey cast.
  awardWash: {
    backgroundColor: withAlpha(AWARD_BADGE_COLOR, 0.14), borderWidth: 1, borderColor: AWARD_BADGE_COLOR,
    shadowOpacity: 0, elevation: 0,
  },
  // Vibe circle + name (shrinks first) on the left, date on the right.
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  vibeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  vibeCircle: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  vibeName: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: C.text },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  authorText: { fontSize: 13, fontWeight: '600', color: C.rustDark, flexShrink: 1 },
  authorFlag: { fontSize: 13 },
  followAction: { marginLeft: 10 },
  // Row layout and gap live in AwardBadges; the header row's gap spaces it.
  publicAwardBadge: { marginLeft: 0 },
  goalDot: {
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  goalDotEmpty: {
    backgroundColor: 'transparent', borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: C.faint,
  },
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
  // Quick Tickle body: QT mark, then the "Tickle it" pill and its dismiss
  // X. The pill is transparent with a 1.5dp INK outline and INK label;
  // 40dp tall like Home's pills. The mark is a 28dp filled INK circle
  // with a white "QT", so it doesn't read as a button. It isn't
  // pressable.
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickDot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: INK,
    alignItems: 'center', justifyContent: 'center',
  },
  quickDotLabel: { fontSize: 10, fontWeight: '700', color: C.card },
  // The app-wide pill height (lib/buttonSize.js), 44dp to tap.
  tickleItPill: {
    minHeight: BUTTON_HEIGHT, paddingHorizontal: 14, justifyContent: 'center',
    borderRadius: BUTTON_RADIUS, borderWidth: 1.5, borderColor: INK, backgroundColor: 'transparent',
  },
  tickleItLabel: { fontSize: 12, fontWeight: '600', color: INK },
  // entryDate's type; shrinks and wraps rather than pushing the row at
  // large font sizes.
  quickLabel: { flexShrink: 1 },
  // 24dp circle; hitSlop (10) brings the tap target to 44dp.
  tickleItDismiss: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: INK,
    alignItems: 'center', justifyContent: 'center',
  },
  // alignSelf flex-start so the chip hugs its content instead of
  // stretching the full row; the title is the only part that shrinks,
  // so a long Tale title truncates without ever clipping "· not Rippled".
  // Filled with Home's Blogbits card colour, cream text (7.18:1). The 1dp
  // border stays, in the fill colour, so the chip keeps its size.
  taleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%',
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, marginBottom: 6,
    backgroundColor: DECK_COLORS.multickles, borderWidth: 1, borderColor: DECK_COLORS.multickles,
  },
  taleChipTitle: { fontSize: 11, fontWeight: '600', color: DECK_TEXT, flexShrink: 1 },
  taleChipMeta: { fontSize: 11, fontWeight: '600', color: DECK_TEXT },
  // Below the text, about 110dp tall, rounded.
  linkedPhotoStrip: {
    width: '100%', height: 110, borderRadius: 16, overflow: 'hidden', marginTop: 8,
    backgroundColor: C.border,
  },
  linkedPhotoStripImage: { width: '100%', height: '100%' },

  entryDate: { flexShrink: 0, fontSize: 12, color: C.subtext },
  linkDivider: { height: 1, backgroundColor: CARD_LINE, marginTop: 8, marginBottom: 2 },
  // Two groups pushed to either edge; wraps at a large font scale.
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' },
  linkGroup: { flexDirection: 'row', alignItems: 'center' },
  // Every link-row control: at least 44dp wide and LINK_TARGET_HEIGHT
  // tall (minHeight, so taller content at a large font size still
  // grows); LINK_HIT_SLOP brings the tap area to 44dp tall.
  linkTarget: { minWidth: 44, minHeight: LINK_TARGET_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  // Icon + label (Ripple), padded so the label isn't flush to
  // its target.
  labelAction: { flexDirection: 'row', gap: 4, paddingHorizontal: 8 },
  labelActionText: { fontSize: 13, fontWeight: '600', color: INK },
  followLink: { fontSize: 12, fontWeight: '600', color: C.rust },
  followLinkActive: { color: C.subtext },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeCount: { fontSize: 12, fontWeight: '600', color: C.subtext },
  likeCountActive: { color: C.sparkleText },
  starIcon: { fontSize: 18, color: C.subtext },
  starIconActive: { color: C.amberDark },
});
