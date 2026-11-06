import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, AccessibilityInfo, useWindowDimensions, PanResponder, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BUTTON_HEIGHT, BUTTON_HIT_SLOP, BUTTON_RADIUS } from '../lib/buttonSize';
import { TILE_SOURCE, TILE_SIZE as WALLPAPER_TILE_SIZE, OPACITY as WALLPAPER_OPACITY } from './TiledWallpaper';

// Home's flip-card deck (Task 3 H5): one card in front, the others fanned
// behind it. It replaces the four stacked bottom sections. A sideways
// swipe either way brings the next card (the nearest one behind) forward;
// the arrows and dots go to the previous, next or any card. Plain RN
// Animated only -- no gesture or animation library.
//
// cards: [{ key, title, sub, subA11y, headerAction, headerRight, headerAdd, color, children }]
//   key          stable id ('remember' | 'goals' | 'rewards' | 'multickles' | 'rnrs')
//   sub          optional sub line under the title
//   headerAction optional { label, a11yLabel, onPress } -- a small text
//                button at the right of the title (no card uses it now)
//   headerRight  optional node at the right of the header, in the same
//                wrapping row as the title and headerAction (Blogbits'
//                Follow / Mine / +); it should not shrink (flexShrink 0)
//   headerAdd    optional { a11yLabel, onPress } -- a round + button in
//                the header's right corner, outside the wrapping row, so
//                a long title goes to 2 lines instead of moving it (Your
//                Goals, My Rewards, Nudges & Notes). Front card only.
//   children     the card's rows (scroll vertically inside the card)
// The caller only passes the cards that are showing (e.g. no My Rewards
// while Tokens & Rewards is off), so the deck can hold 1 to 5.

export const DECK_WIDTH = 322;
// Height at font scale 1.0. It grows with the font scale, up to 1.6x
// (deckHeightFor below), so a large font scale doesn't squeeze the list.
export const DECK_HEIGHT = 256;
const DECK_MAX_GROWTH = 1.6;

// 256 at font scale 1.0 (and below -- it never shrinks), 410 at 1.6 and
// above (e.g. 2.0).
export function deckHeightFor(fontScale) {
  return Math.round(DECK_HEIGHT * Math.min(Math.max(fontScale || 1, 1), DECK_MAX_GROWTH));
}
// Flexible deck: at the default text size (font scale up to
// DECK_FIT_MAX_FONT_SCALE) the cards take the room the caller gives
// (fitHeight, less the dots and arrows row), clamped to DECK_MIN_HEIGHT
// .. DECK_MAX_HEIGHT. Larger text keeps deckHeightFor's font-scaled
// height and the page scrolls, as before.
const DECK_MIN_HEIGHT = 200;
const DECK_MAX_HEIGHT = 256;
const DECK_FIT_MAX_FONT_SCALE = 1.15;
export const DECK_COLORS = {
  remember: '#7A3B2A',
  goals: '#4B5A40',
  rewards: '#6B5420',
  multickles: '#425762',
  rnrs: '#5B384E',
};
export const DECK_TEXT = '#FFF8EC';
export const DECK_SUBTEXT = '#F1E4D0';
// List rows are the card colour darkened by ROW_SHADE -- what black at
// that opacity over the card gives -- but as a SOLID colour, so the
// corner circle doesn't show through them. deckRowFill turns a card's
// '#RRGGBB' colour into that row fill.
const ROW_SHADE = 0.18;
export function deckRowFill(cardHex) {
  const c = cardHex.replace('#', '');
  const ch = (i) => Math.round(parseInt(c.slice(i, i + 2), 16) * (1 - ROW_SHADE));
  return `rgb(${ch(0)}, ${ch(2)}, ${ch(4)})`;
}

const DOT_ACTIVE = '#4A1F10';
const DOT_INACTIVE = '#8F8678';
const VEIL = '#1E0C06';
// Fan for the cards behind the front one, nearest first: shift (dp,
// negative Y = up, so they peek out ABOVE the front card), tilt (degrees)
// and how dark the veil is.
const FAN = [
  { translateX: 14, translateY: -8, rotateDeg: 3, veil: 0.18 },
  { translateX: -14, translateY: -14, rotateDeg: -4, veil: 0.3 },
  { translateX: 8, translateY: -22, rotateDeg: 6, veil: 0.42 },
];
// The cards behind are narrower than the front one: each side is inset
// just enough that, after its shift and tilt, no back card reaches more
// than BACK_CARD_MAX_OVERHANG dp past the front card's left or right
// edge, and each card is at least BACK_CARD_INSET_STEP dp narrower per
// side than the one in front of it.
const BACK_CARD_MAX_OVERHANG = 6;
const BACK_CARD_INSET_STEP = 2;
// Deck card shadow (style prop boxShadow; no elevation on the cards).
const DECK_CARD_SHADOW = '0 16px 30px -4px rgba(74,31,16,0.35)';
// Outline on every card: same colour and thickness as the list rows'
// outline (deckRowStyles.row). The card's padding is cut by the same
// amount, so nothing inside moves.
const CARD_BORDER_COLOR = 'rgba(255,248,236,0.22)';
const CARD_BORDER_WIDTH = 1;
const CARD_PADDING_TOP = 16;
const CARD_PADDING_SIDE = 16;
// The header's round + button (headerAdd): 30dp circle, 18dp icon,
// 7dp hitSlop all round for a 44x44dp tap area. Exported so Blogbits'
// + beside Follow / Mine (home.js) is the same size.
export const HEADER_ADD_SIZE = 30;
export const HEADER_ADD_ICON_SIZE = 18;
export const HEADER_ADD_HIT_SLOP = { top: 7, bottom: 7, left: 7, right: 7 };
// Faint circle in each card's top-left corner, clipped by the card's
// rounded corners (the card's own overflow: 'hidden'). Offsets are from
// the card's outer top-left corner.
const CORNER_CIRCLE_SIZE = 220;
const CORNER_CIRCLE_ABOVE = 70;
const CORNER_CIRCLE_LEFT = 60;
const CORNER_CIRCLE_FILL = 'rgba(255,255,255,0.08)';
// Wallpaper tiles inside the corner circle, at the page background's own
// tile size and opacity (components/TiledWallpaper.js). Only the part of
// the circle inside the card can show: in the circle's own coordinates
// that starts at (CORNER_CIRCLE_LEFT, CORNER_CIRCLE_ABOVE), the card's
// outer top-left corner, and runs to the circle's far edge. The grid
// starts there and covers just that area (2 x 2 tiles at today's sizes).
const CORNER_TILES = (() => {
  const cols = Math.ceil((CORNER_CIRCLE_SIZE - CORNER_CIRCLE_LEFT) / WALLPAPER_TILE_SIZE);
  const rows = Math.ceil((CORNER_CIRCLE_SIZE - CORNER_CIRCLE_ABOVE) / WALLPAPER_TILE_SIZE);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        key: `${r}-${c}`,
        left: CORNER_CIRCLE_LEFT + c * WALLPAPER_TILE_SIZE,
        top: CORNER_CIRCLE_ABOVE + r * WALLPAPER_TILE_SIZE,
      });
    }
  }
  return tiles;
})();

// Per-side inset (dp) for each FAN card, for this deck size. A card w
// wide and h tall, tilted by a, reaches (w/2)cos(a) + (h/2)sin(a) out
// from its centre, plus its sideways shift.
function backCardInsets(width, height) {
  const insets = [];
  for (const f of FAN) {
    const a = (Math.abs(f.rotateDeg) * Math.PI) / 180;
    const cos = Math.cos(a);
    const reach = Math.abs(f.translateX) + (width / 2) * cos + (height / 2) * Math.sin(a);
    const needed = Math.ceil((reach - width / 2 - BACK_CARD_MAX_OVERHANG) / cos);
    const prev = insets.length ? insets[insets.length - 1] + BACK_CARD_INSET_STEP : 0;
    insets.push(Math.max(0, needed, prev));
  }
  return insets;
}
// Half a flip (front card edge-on), in ms.
const FLIP_HALF_MS = 140;
// The card the deck was left on (its key), per phone -- same naming as
// lib/quickTickle.js's 'daytickles-quick-tickle-dismissed'. Best-effort:
// any read error, or a saved card that isn't showing, opens card 1.
const DECK_CARD_KEY = 'daytickles-home-deck-card';
// Sideways swipe (Task 3 H7): the deck only claims a drag once it has
// moved this far sideways AND at least twice as far sideways as up or
// down, so vertical drags still scroll the page and the card's list.
// While dragged, the front card follows the finger one-to-one, tilting
// up to SWIPE_TILT_DEG. Released past SWIPE_FRACTION of the card's width,
// or flicked faster than SWIPE_VELOCITY, it carries on off the deck
// (SWIPE_OUT_MS, to SWIPE_OUT_EXTRA dp past its own width) and only then
// does the next card -- the nearest one behind -- come forward, whichever
// way it was swiped; anything less springs back.
const SWIPE_CLAIM_DX = 12;
const SWIPE_FRACTION = 0.25;
const SWIPE_VELOCITY = 0.35;
const SWIPE_OUT_MS = 180;
const SWIPE_OUT_EXTRA = 40;
const SWIPE_TILT_DEG = 4;
// Longest the deck waits for the saved card and its data before it shows
// anyway, so a failed or slow fetch can't hold it back.
const DECK_WAIT_MS = 3000;
// The controls row under the cards: its 18dp top margin + 44dp targets.
// Reserved along with the cards while the deck waits.
const CONTROLS_SPACE = 18 + 44;

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduceMotion(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduceMotion;
}

// The faint corner circle: decoration only, drawn first so the title,
// rows and veil sit on top of it.
function CornerCircle() {
  return (
    <View
      style={styles.cornerCircle}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {CORNER_TILES.map((t) => (
        <Image key={t.key} source={TILE_SOURCE} style={[styles.cornerTile, { left: t.left, top: t.top }]} />
      ))}
    </View>
  );
}

// Soft fade at the bottom of a card's list, in the card's own colour, so
// rows that scroll under it fade out instead of being cut off.
function BottomFade({ color }) {
  return (
    <View style={styles.fade} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="deckFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#deckFade)" />
      </Svg>
    </View>
  );
}

// dataSettled: the caller's "every card's data is in" flag. The deck
// stays a blank space of its own size until that and the saved-card read
// are both done (or DECK_WAIT_MS has passed), then opens once on the
// right card -- so a card that loads late never makes it jump.
// fitHeight (optional): the room from the top of the cards to where the
// dots and arrows row must end. See the flexible-deck constants above.
export default function HomeDeck({ cards, width, dataSettled = true, fitHeight = null }) {
  const reduceMotion = useReduceMotion();
  // useWindowDimensions' fontScale (same value as PixelRatio.getFontScale)
  // re-renders the deck if the font size changes while the app is open.
  const fontScale = useWindowDimensions().fontScale || 1;
  const fullHeight = deckHeightFor(fontScale);
  const deckHeight = fitHeight != null && fontScale <= DECK_FIT_MAX_FONT_SCALE
    ? Math.round(Math.min(DECK_MAX_HEIGHT, Math.max(DECK_MIN_HEIGHT, fitHeight - CONTROLS_SPACE)))
    : fullHeight;
  // Which card is in front, by key, so a card that comes and goes (Your
  // Rewards with Tokens off) doesn't shift it onto the wrong card.
  const [activeKey, setActiveKey] = useState(null);
  const flip = useRef(new Animated.Value(0)).current;
  const flipping = useRef(false);
  // The saved card: undefined while it's being read, then a key or null.
  const [savedKey, setSavedKey] = useState(undefined);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(DECK_CARD_KEY)
      .then((saved) => {
        if (alive) setSavedKey(typeof saved === 'string' && saved ? saved : null);
      })
      .catch(() => {
        if (alive) setSavedKey(null);
      });
    const timer = setTimeout(() => {
      if (alive) setWaitedTooLong(true);
    }, DECK_WAIT_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  // Decided once: the saved card if it's showing, otherwise card 1. The
  // front card is then held by its key, so cards that turn up or drop out
  // later don't move it.
  const ready = (savedKey !== undefined && dataSettled) || waitedTooLong;
  useEffect(() => {
    if (shown || !ready || cards.length === 0) return;
    const validSaved = !!savedKey && cards.some((c) => c.key === savedKey);
    setActiveKey(validSaved ? savedKey : cards[0].key);
    setShown(true);
  }, [ready, shown, savedKey, cards]);

  function choose(key) {
    setActiveKey(key);
    AsyncStorage.setItem(DECK_CARD_KEY, key).catch(() => {});
  }

  const count = cards.length;
  const foundIndex = cards.findIndex((c) => c.key === activeKey);
  const index = foundIndex >= 0 ? foundIndex : 0;
  const front = cards[index];

  function announce(nextIndex) {
    AccessibilityInfo.announceForAccessibility(`Card ${nextIndex + 1} of ${count}: ${cards[nextIndex].title}`);
  }

  // The front card's sideways offset while it follows a swipe (see the
  // responder below). Declared before goTo, which resets it. State, not a
  // ref: a finished swipe swaps in a fresh value at 0 in the SAME render
  // that changes the card, so the swiped-off card can never flash back to
  // the centre while the new card's content is still on its way.
  const [dragX, setDragX] = useState(() => new Animated.Value(0));

  // direction: 1 = forward (next), -1 = back. Reduced motion: no flip,
  // the card just changes. Returns true when it starts a change, false
  // when it's ignored (same card, a flip already running, no cards).
  function goTo(nextIndex, direction) {
    if (count === 0 || nextIndex === index || flipping.current) return false;
    const nextKey = cards[nextIndex].key;
    if (reduceMotion) {
      choose(nextKey);
      announce(nextIndex);
      return true;
    }
    flipping.current = true;
    Animated.timing(flip, { toValue: direction, duration: FLIP_HALF_MS, useNativeDriver: true }).start(() => {
      choose(nextKey);
      // The card is edge-on here, so a swiped card's offset can be reset
      // unseen -- the next card turns in centred, and the swiped one
      // never slides back against the swipe.
      dragX.setValue(0);
      flip.setValue(-direction);
      Animated.timing(flip, { toValue: 0, duration: FLIP_HALF_MS, useNativeDriver: true }).start(() => {
        flipping.current = false;
      });
    });
    announce(nextIndex);
    return true;
  }

  function goNext() {
    return goTo((index + 1) % count, 1);
  }

  function goPrev() {
    return goTo((index - 1 + count) % count, -1);
  }

  // A released swipe. towards (-1 = left, 1 = right) is only the way the
  // front card slides off; either way the NEXT card comes forward -- the
  // nearest card behind (depth 1 in the fan), the one already peeking out.
  // The card slides the rest of the way off the deck first; only when
  // it's gone does the order change. Reduced motion: no slide, the card
  // just changes to that same next card. Returns false when ignored (one
  // card, or a flip or swipe already running). The arrows and dots still
  // go back and forth (goNext, goPrev, goTo).
  function swipeAway(towards) {
    if (count < 2 || flipping.current) return false;
    const nextIndex = (index + 1) % count;
    const nextKey = cards[nextIndex].key;
    if (reduceMotion) {
      choose(nextKey);
      announce(nextIndex);
      return true;
    }
    flipping.current = true;
    Animated.timing(dragX, {
      toValue: towards * (width + SWIPE_OUT_EXTRA),
      duration: SWIPE_OUT_MS,
      useNativeDriver: true,
    }).start(() => {
      // Both in one render: the new front card, at a fresh centred offset.
      setDragX(new Animated.Value(0));
      choose(nextKey);
      flipping.current = false;
    });
    announce(nextIndex);
    return true;
  }

  // The front card follows the finger sideways (not with reduced motion,
  // where it just changes on release). The responder is made once, so it
  // reads the latest render's values through this ref.
  const latest = useRef(null);
  latest.current = { swipeAway, count, reduceMotion, dragX, width };
  const swipe = useRef(
    PanResponder.create({
      // Capture: decided before the rows and the list see the move, but
      // only for mostly-sideways moves, so taps and vertical scrolls
      // still reach them.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        latest.current.count > 1 &&
        Math.abs(g.dx) > SWIPE_CLAIM_DX &&
        Math.abs(g.dx) > 2 * Math.abs(g.dy),
      // Once claimed, neither the page ScrollView nor the card's list can
      // take the drag back halfway: no JS hand-over, and native scrolling
      // is blocked while the deck holds the gesture.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (!latest.current.reduceMotion) latest.current.dragX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        const L = latest.current;
        const far = Math.abs(g.dx) > L.width * SWIPE_FRACTION || Math.abs(g.vx) > SWIPE_VELOCITY;
        // The card slides off the way it was dragged (a flick with almost
        // no distance goes by its speed's direction); either way the next
        // card, the one behind it, comes forward (see swipeAway).
        const towards = Math.sign(g.dx) || Math.sign(g.vx);
        const started = far && towards !== 0 && L.swipeAway(towards);
        // Not far enough, or ignored (e.g. a flip already running): back
        // to centre. With reduced motion the card never followed the
        // finger, so this is a no-op there.
        if (!started) {
          Animated.spring(L.dragX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(latest.current.dragX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    })
  ).current;

  if (!front) return null;
  // Waiting: the deck's own space, empty, so the page doesn't jump when it
  // opens.
  if (!shown) {
    return (
      <View
        style={{ width, height: deckHeight + CONTROLS_SPACE, alignSelf: 'center' }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
    );
  }

  const rotateY = flip.interpolate({ inputRange: [-1, 0, 1], outputRange: ['90deg', '0deg', '-90deg'] });
  // Small tilt while the card is dragged, full at one card-width away.
  const tilt = dragX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [`-${SWIPE_TILT_DEG}deg`, '0deg', `${SWIPE_TILT_DEG}deg`],
    extrapolate: 'clamp',
  });
  // The cards behind, in the order they'd come next, nearest last so it
  // draws on top of the farther ones.
  const behind = [];
  for (let d = 1; d < Math.min(count, FAN.length + 1); d++) behind.push({ card: cards[(index + d) % count], depth: d });
  const insets = backCardInsets(width, deckHeight);

  return (
    <View style={styles.wrap}>
      <View style={[styles.stack, { width, height: deckHeight }]} {...swipe.panHandlers}>
        {behind.reverse().map(({ card, depth }) => {
          const fan = FAN[depth - 1];
          const inset = insets[depth - 1];
          return (
            // Decoration only: not touchable, hidden from TalkBack.
            <View
              key={card.key}
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={[
                styles.card,
                {
                  left: inset,
                  right: inset,
                  backgroundColor: card.color,
                  transform: [{ translateX: fan.translateX }, { translateY: fan.translateY }, { rotate: `${fan.rotateDeg}deg` }],
                },
              ]}
            >
              <CornerCircle />
              <Text style={styles.title} numberOfLines={1}>{card.title}</Text>
              <View style={[styles.veil, { opacity: fan.veil }]} />
            </View>
          );
        })}

        <Animated.View
          style={[
            styles.card,
            { backgroundColor: front.color, transform: [{ perspective: 1000 }, { translateX: dragX }, { rotateY }, { rotate: tilt }] },
          ]}
        >
          <CornerCircle />
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{front.title}</Text>
              {!!front.headerAction && (
                <TouchableOpacity
                  onPress={front.headerAction.onPress}
                  style={styles.headerAction}
                  hitSlop={BUTTON_HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={front.headerAction.a11yLabel || front.headerAction.label}
                >
                  <Text style={styles.headerActionText} numberOfLines={1}>{front.headerAction.label}</Text>
                </TouchableOpacity>
              )}
              {front.headerRight || null}
            </View>
            {!!front.headerAdd && (
              <TouchableOpacity
                onPress={front.headerAdd.onPress}
                style={styles.headerAdd}
                hitSlop={HEADER_ADD_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={front.headerAdd.a11yLabel}
              >
                <Ionicons name="add" size={HEADER_ADD_ICON_SIZE} color={DECK_TEXT} />
              </TouchableOpacity>
            )}
          </View>
          {!!front.sub && (
            <Text style={styles.sub} accessibilityLabel={front.subA11y || undefined}>{front.sub}</Text>
          )}
          <View style={styles.listWrap}>
            {/* nestedScrollEnabled: Android otherwise hands this list's
                vertical drags to Home's page ScrollView. Keyed by card, so
                each card opens at the top of its list. */}
            <ScrollView
              key={front.key}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            >
              {front.children}
            </ScrollView>
            <BottomFade color={front.color} />
          </View>
        </Animated.View>
      </View>

      {count > 1 && (
        <View style={styles.controls}>
          <TouchableOpacity
            onPress={goPrev}
            style={styles.control}
            accessibilityRole="button"
            accessibilityLabel="Previous card"
          >
            <Ionicons name="chevron-back" size={22} color={DOT_ACTIVE} />
          </TouchableOpacity>
          {cards.map((card, i) => (
            <TouchableOpacity
              key={card.key}
              onPress={() => goTo(i, i > index ? 1 : -1)}
              style={styles.control}
              accessibilityRole="button"
              accessibilityLabel={`Card ${i + 1} of ${count}: ${card.title}`}
              accessibilityState={{ selected: i === index }}
            >
              <View style={i === index ? styles.dotActive : styles.dotInactive} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={goNext}
            style={styles.control}
            accessibilityRole="button"
            accessibilityLabel="Next card"
          >
            <Ionicons name="chevron-forward" size={22} color={DOT_ACTIVE} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// Shared by the rows the caller puts in a card.
export const deckRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 48, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14,
    // See-through fallback only: callers add the card's solid
    // deckRowFill so the corner circle stays behind the rows.
    backgroundColor: `rgba(0,0,0,${ROW_SHADE})`, borderWidth: 1, borderColor: 'rgba(255,248,236,0.22)',
  },
  // Empty-card stand-in: same shape, no fill, dashed outline, no text.
  placeholder: {
    minHeight: 48, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed',
    borderColor: 'rgba(255,248,236,0.45)',
  },
  label: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: DECK_TEXT, lineHeight: 19 },
  // Pushes whatever follows it to the row's right edge.
  spacer: { flex: 1 },
  meta: { flexShrink: 0, fontSize: 14, fontWeight: '700', color: DECK_TEXT },
  body: { fontSize: 14, color: DECK_SUBTEXT, lineHeight: 20 },
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  stack: { position: 'relative' },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24, overflow: 'hidden',
    borderWidth: CARD_BORDER_WIDTH, borderColor: CARD_BORDER_COLOR,
    paddingTop: CARD_PADDING_TOP - CARD_BORDER_WIDTH,
    paddingHorizontal: CARD_PADDING_SIDE - CARD_BORDER_WIDTH,
    // No elevation: drawing order is the JSX order (back cards first).
    boxShadow: DECK_CARD_SHADOW,
  },
  // Covers the whole card, its outline included (absolute children are
  // placed inside the border, hence the negative offsets).
  veil: {
    position: 'absolute',
    top: -CARD_BORDER_WIDTH, left: -CARD_BORDER_WIDTH, right: -CARD_BORDER_WIDTH, bottom: -CARD_BORDER_WIDTH,
    backgroundColor: VEIL,
  },
  cornerCircle: {
    position: 'absolute',
    top: -CORNER_CIRCLE_ABOVE - CARD_BORDER_WIDTH,
    left: -CORNER_CIRCLE_LEFT - CARD_BORDER_WIDTH,
    width: CORNER_CIRCLE_SIZE, height: CORNER_CIRCLE_SIZE, borderRadius: CORNER_CIRCLE_SIZE / 2,
    backgroundColor: CORNER_CIRCLE_FILL,
    // Clips the wallpaper tiles to the circle (the card clips the rest).
    overflow: 'hidden',
  },
  // Same size and strength as the page background's tiles.
  cornerTile: {
    position: 'absolute',
    width: WALLPAPER_TILE_SIZE, height: WALLPAPER_TILE_SIZE,
    opacity: WALLPAPER_OPACITY,
  },
  // The wrapping row (title and its buttons) beside the corner + button.
  // flex-start: the + lines up with the title's first line.
  header: { flexDirection: 'row', alignItems: 'flex-start', columnGap: 10 },
  // Wraps: when the title and a header button (Follow / Mine) don't fit
  // on one line, the button drops under the title instead of squeezing it.
  headerRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 8 },
  // Round + in the corner: drawn 30dp, laid out 24dp (marginVertical -3)
  // so the header is no taller than the title alone.
  headerAdd: {
    flexShrink: 0, width: HEADER_ADD_SIZE, height: HEADER_ADD_SIZE, borderRadius: HEADER_ADD_SIZE / 2,
    marginVertical: -3, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,248,236,0.6)',
  },
  // Sized to its text (flexBasis auto) so the row can tell when to wrap;
  // still takes the spare width, and shrinks only when alone on a line.
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 18, fontWeight: '700', color: DECK_TEXT },
  // The app-wide pill height (lib/buttonSize.js), 44dp to tap.
  headerAction: {
    flexShrink: 0, minHeight: BUTTON_HEIGHT, justifyContent: 'center',
    paddingHorizontal: 12, borderRadius: BUTTON_RADIUS,
    borderWidth: 1, borderColor: 'rgba(255,248,236,0.6)',
  },
  headerActionText: { fontSize: 13, fontWeight: '600', color: DECK_TEXT },
  sub: { marginTop: 2, fontSize: 13, color: DECK_SUBTEXT },
  listWrap: { flex: 1, marginTop: 10 },
  listContent: { gap: 8, paddingBottom: 28 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 28 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  control: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dotActive: { width: 10, height: 10, borderRadius: 5, backgroundColor: DOT_ACTIVE },
  dotInactive: { width: 8, height: 8, borderRadius: 4, backgroundColor: DOT_INACTIVE },
});
