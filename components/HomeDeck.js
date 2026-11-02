import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, AccessibilityInfo, useWindowDimensions, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Home's flip-card deck (Task 3 H5): one card in front, the others fanned
// behind it. It replaces the four stacked bottom sections. Plain RN
// Animated only -- no gesture or animation library.
//
// cards: [{ key, title, sub, subA11y, headerAction, color, children }]
//   key          stable id ('remember' | 'goals' | 'rewards' | 'multickles')
//   sub          optional sub line under the title
//   headerAction optional { label, a11yLabel, onPress } -- a small button
//                at the right of the header (Your Rewards' Reward List)
//   children     the card's rows (scroll vertically inside the card)
// The caller only passes the cards that are showing (e.g. no Your Rewards
// while Tokens & Rewards is off), so the deck can hold 1 to 4.

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
export const DECK_COLORS = {
  remember: '#7A3B2A',
  goals: '#4B5A40',
  rewards: '#6B5420',
  multickles: '#425762',
};
export const DECK_TEXT = '#FFF8EC';
export const DECK_SUBTEXT = '#F1E4D0';

const DOT_ACTIVE = '#4A1F10';
const DOT_INACTIVE = '#8F8678';
const VEIL = '#1E0C06';
// Fan for the cards behind the front one, nearest first: tilt, drop and
// how dark the veil is.
const FAN = [
  { rotate: '-3deg', translateY: 6, veil: 0.18 },
  { rotate: '3.5deg', translateY: 10, veil: 0.3 },
  { rotate: '-6deg', translateY: 14, veil: 0.42 },
];
// Half a flip (front card edge-on), in ms.
const FLIP_HALF_MS = 140;
// The card the deck was left on (its key), per phone -- same naming as
// lib/quickTickle.js's 'daytickles-quick-tickle-dismissed'. Best-effort:
// any read error, or a saved card that isn't showing, opens card 1.
const DECK_CARD_KEY = 'daytickles-home-deck-card';
// Sideways swipe (Task 3 H7): the deck only claims a drag once it has
// moved this far sideways AND at least twice as far sideways as up or
// down, so vertical drags still scroll the page and the card's list.
// Past SWIPE_DISTANCE, or a quicker flick than SWIPE_VELOCITY, changes
// the card; anything less springs back.
const SWIPE_CLAIM_DX = 12;
const SWIPE_DISTANCE = 70;
const SWIPE_VELOCITY = 0.35;
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
export default function HomeDeck({ cards, width, dataSettled = true }) {
  const reduceMotion = useReduceMotion();
  // useWindowDimensions' fontScale (same value as PixelRatio.getFontScale)
  // re-renders the deck if the font size changes while the app is open.
  const deckHeight = deckHeightFor(useWindowDimensions().fontScale);
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
  // responder below). Declared before goTo, which resets it.
  const dragX = useRef(new Animated.Value(0)).current;

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

  // The front card follows the finger sideways (not with reduced motion,
  // where it just changes on release). The responder is made once, so it
  // reads the latest render's values through this ref.
  const latest = useRef(null);
  latest.current = { goNext, goPrev, count, reduceMotion };
  const swipe = useRef(
    PanResponder.create({
      // Capture: decided before the rows and the list see the move, but
      // only for mostly-sideways moves, so taps and vertical scrolls
      // still reach them.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        latest.current.count > 1 &&
        Math.abs(g.dx) > SWIPE_CLAIM_DX &&
        Math.abs(g.dx) > 2 * Math.abs(g.dy),
      // Once claimed, the page ScrollView can't take the drag back halfway.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (!latest.current.reduceMotion) dragX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        const far = Math.abs(g.dx) > SWIPE_DISTANCE || Math.abs(g.vx) > SWIPE_VELOCITY;
        // Swipe left = next card, right = previous. A started flip resets
        // the offset itself, at the swap (see goTo).
        const started = far && (g.dx < 0 ? latest.current.goNext() : latest.current.goPrev());
        // Not far enough, or ignored (e.g. a flip already running): back
        // to centre. With reduced motion the card never followed the
        // finger, so this is a no-op there.
        if (!started || latest.current.reduceMotion) {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
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
  // The cards behind, in the order they'd come next, nearest last so it
  // draws on top of the farther ones.
  const behind = [];
  for (let d = 1; d < Math.min(count, FAN.length + 1); d++) behind.push({ card: cards[(index + d) % count], depth: d });

  return (
    <View style={styles.wrap}>
      <View style={[styles.stack, { width, height: deckHeight }]} {...swipe.panHandlers}>
        {behind.reverse().map(({ card, depth }) => {
          const fan = FAN[depth - 1];
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
                styles.backCard,
                { backgroundColor: card.color, transform: [{ translateY: fan.translateY }, { rotate: fan.rotate }] },
              ]}
            >
              <Text style={styles.title} numberOfLines={1}>{card.title}</Text>
              <View style={[StyleSheet.absoluteFill, styles.veil, { opacity: fan.veil }]} />
            </View>
          );
        })}

        <Animated.View
          style={[
            styles.card,
            { backgroundColor: front.color, transform: [{ perspective: 1000 }, { translateX: dragX }, { rotateY }] },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{front.title}</Text>
            {!!front.headerAction && (
              <TouchableOpacity
                onPress={front.headerAction.onPress}
                style={styles.headerAction}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={front.headerAction.a11yLabel || front.headerAction.label}
              >
                <Text style={styles.headerActionText} numberOfLines={1}>{front.headerAction.label}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: 'rgba(255,248,236,0.22)',
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
    borderRadius: 24, paddingTop: 16, paddingHorizontal: 16, overflow: 'hidden',
    shadowColor: '#1E0C06', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 5,
  },
  backCard: { elevation: 2 },
  veil: { backgroundColor: VEIL },
  // Wraps: when the title and a header button (Reward List) don't fit on
  // one line, the button drops under the title instead of squeezing it.
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 8 },
  // Sized to its text (flexBasis auto) so the row can tell when to wrap;
  // still takes the spare width, and shrinks only when alone on a line.
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 18, fontWeight: '700', color: DECK_TEXT },
  headerAction: {
    flexShrink: 0, minHeight: 32, justifyContent: 'center',
    paddingHorizontal: 12, borderRadius: 16,
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
