import { useEffect, useRef } from 'react';
import { Modal, Image, TouchableOpacity, StyleSheet, View, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Shared by the Pin Board screen's own tap-to-enlarge and EntryCard's
// reverse photo indicator — `uri` doubles as the visibility gate (same
// shape as GoalTagModal's `entry` prop), so there's no separate boolean
// to keep in sync with it.
//
// Pinch to zoom, plain React Native only (PanResponder + Animated, like
// HomeDeck's swipe): two fingers zoom between 1x and 4x around the point
// between them, one finger moves the photo while it's zoomed (never
// pulling an edge inside the screen), and letting go springs it back
// inside those limits. A quick, still tap outside the photo closes the
// viewer, but only at 1x; the X and Android's back button always close it.
// Zoom and position reset whenever it closes or shows another photo.

const MIN_SCALE = 1;
const MAX_SCALE = 4;
// While the fingers are down the photo may go a little past the limits;
// it springs back to them when they lift.
const PINCH_LOWEST = 0.6;
const PINCH_HIGHEST = 5;
// A touch counts as a tap when it moves less than this (dp) and lifts
// within this time (ms).
const TAP_MAX_MOVE = 10;
const TAP_MAX_MS = 300;
// Scales within this of 1x count as 1x.
const AT_REST = 0.01;
const SPRING = { useNativeDriver: false, friction: 8, tension: 80 };

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Fingers still on the screen. On a lift (lifting = true), Android can
// still list the finger that just went up among the touches, so it's
// left out.
function fingersDown(evt, lifting = false) {
  const { touches = [], changedTouches = [] } = evt.nativeEvent;
  if (!lifting) return touches;
  return touches.filter((t) => !changedTouches.some((c) => c.identifier === t.identifier));
}

export default function PhotoEnlargeModal({ uri, onDismiss }) {
  const scale = useRef(new Animated.Value(1)).current;
  const shiftX = useRef(new Animated.Value(0)).current;
  const shiftY = useRef(new Animated.Value(0)).current;
  // Everything the gesture reads straight away (the Animated values can't
  // be read synchronously while a finger moves). Sizes are in dp, in the
  // backdrop's own coordinates, which start at the Modal's top-left.
  const g = useRef({
    s: 1, // current zoom
    x: 0, // current shift of the photo's centre from the box's centre
    y: 0,
    screen: { w: 0, h: 0 }, // the backdrop (the whole Modal)
    box: { x: 0, y: 0, w: 0, h: 0 }, // the 92% x 75% photo box at 1x
    natural: null, // { uri, w, h }: the photo file's own size
    fingers: 0, // how many fingers the starting point below was taken for
    start: null, // where the current pinch or pan started
    tapAt: 0, // tap tracking: when, where, how far it moved, and
    tapX: 0, // whether a second finger ever came down
    tapY: 0,
    moved: 0,
    multi: false,
  }).current;
  // The responder is made once, so it reads the latest props through refs.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const uriRef = useRef(uri);
  uriRef.current = uri;

  function show(s, x, y) {
    g.s = s;
    g.x = x;
    g.y = y;
    scale.setValue(s);
    shiftX.setValue(x);
    shiftY.setValue(y);
  }

  function stopSprings() {
    scale.stopAnimation();
    shiftX.stopAnimation();
    shiftY.stopAnimation();
  }

  function reset() {
    stopSprings();
    g.fingers = 0;
    g.start = null;
    show(1, 0, 0);
  }

  // The photo's size inside the box at 1x ("contain": the whole photo,
  // as big as fits). Until the file's own size is known, the whole box.
  function fittedSize() {
    const { box, natural } = g;
    if (!natural || natural.uri !== uriRef.current || !natural.w || !natural.h) {
      return { w: box.w, h: box.h };
    }
    const k = Math.min(box.w / natural.w, box.h / natural.h);
    return { w: natural.w * k, h: natural.h * k };
  }

  function boxCentre() {
    return { x: g.box.x + g.box.w / 2, y: g.box.y + g.box.h / 2 };
  }

  // The allowed shift at zoom s: a photo wider (or taller) than the
  // screen can move until its edge meets the screen's edge; one that's
  // smaller stays centred on the screen.
  function shiftLimits(s) {
    const f = fittedSize();
    const c = boxCentre();
    const midX = g.screen.w / 2 - c.x;
    const midY = g.screen.h / 2 - c.y;
    const roomX = Math.max(0, (f.w * s - g.screen.w) / 2);
    const roomY = Math.max(0, (f.h * s - g.screen.h) / 2);
    return { x0: midX - roomX, x1: midX + roomX, y0: midY - roomY, y1: midY + roomY };
  }

  function insidePhoto(px, py) {
    const f = fittedSize();
    const c = boxCentre();
    return (
      Math.abs(px - (c.x + g.x)) <= (f.w * g.s) / 2 &&
      Math.abs(py - (c.y + g.y)) <= (f.h * g.s) / 2
    );
  }

  // Takes a fresh starting point whenever the number of fingers changes,
  // so adding a second finger, or lifting one after a pinch, carries on
  // from where the photo is now instead of jumping.
  function restart(fingers) {
    g.fingers = fingers.length;
    if (fingers.length >= 2) {
      const [a, b] = fingers;
      const midX = (a.pageX + b.pageX) / 2;
      const midY = (a.pageY + b.pageY) / 2;
      const c = boxCentre();
      g.start = {
        mode: 'pinch',
        dist: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1,
        s: g.s,
        // The spot on the photo between the fingers, measured from the
        // photo's centre at 1x, so it can be kept under them.
        px: (midX - c.x - g.x) / g.s,
        py: (midY - c.y - g.y) / g.s,
      };
    } else if (fingers.length === 1) {
      g.start = { mode: 'pan', fx: fingers[0].pageX, fy: fingers[0].pageY, x: g.x, y: g.y };
    } else {
      g.start = null;
    }
  }

  function follow(fingers) {
    if (fingers.length !== g.fingers) restart(fingers);
    const st = g.start;
    if (!st) return;
    if (st.mode === 'pinch' && fingers.length >= 2) {
      const [a, b] = fingers;
      const midX = (a.pageX + b.pageX) / 2;
      const midY = (a.pageY + b.pageY) / 2;
      const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
      const s = clamp((st.s * dist) / st.dist, PINCH_LOWEST, PINCH_HIGHEST);
      const c = boxCentre();
      show(s, midX - c.x - s * st.px, midY - c.y - s * st.py);
    } else if (st.mode === 'pan' && fingers.length === 1) {
      // At 1x (or smaller) one finger does nothing.
      if (g.s <= MIN_SCALE + AT_REST) return;
      const lim = shiftLimits(g.s);
      // If a pinch left the photo past an edge, don't snap it back now
      // (that would jump): it just can't go any further out. Letting go
      // puts it right.
      const x = clamp(st.x + fingers[0].pageX - st.fx, Math.min(lim.x0, st.x), Math.max(lim.x1, st.x));
      const y = clamp(st.y + fingers[0].pageY - st.fy, Math.min(lim.y0, st.y), Math.max(lim.y1, st.y));
      show(g.s, x, y);
    }
  }

  // Fingers up: back inside 1x..4x and inside the edges, with a spring.
  function settle() {
    const s = clamp(g.s, MIN_SCALE, MAX_SCALE);
    const lim = shiftLimits(s);
    const x = s <= MIN_SCALE + AT_REST ? 0 : clamp(g.x, lim.x0, lim.x1);
    const y = s <= MIN_SCALE + AT_REST ? 0 : clamp(g.y, lim.y0, lim.y1);
    g.s = s;
    g.x = x;
    g.y = y;
    Animated.parallel([
      Animated.spring(scale, { toValue: s, ...SPRING }),
      Animated.spring(shiftX, { toValue: x, ...SPRING }),
      Animated.spring(shiftY, { toValue: y, ...SPRING }),
    ]).start();
  }

  function close() {
    reset();
    dismissRef.current?.();
  }

  const responder = useRef(null);
  if (!responder.current) {
    responder.current = PanResponder.create({
      // Bubbling, not capture: the X (a child) still gets its own taps.
      // Every other touch is taken at once, so the backdrop never needs
      // to take one over mid-move (which could cancel a press on the X).
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => false,
      // Once a pinch or pan has started, nothing else can take it halfway.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        // A spring still running: carry on from where it is now.
        scale.stopAnimation((v) => { g.s = v; });
        shiftX.stopAnimation((v) => { g.x = v; });
        shiftY.stopAnimation((v) => { g.y = v; });
        const fingers = fingersDown(evt);
        g.tapAt = Date.now();
        g.tapX = fingers[0]?.pageX ?? 0;
        g.tapY = fingers[0]?.pageY ?? 0;
        g.moved = 0;
        g.multi = fingers.length > 1;
        restart(fingers);
      },
      // Another finger down while the gesture is held.
      onPanResponderStart: (evt) => {
        const fingers = fingersDown(evt);
        if (fingers.length > 1) g.multi = true;
        if (fingers.length !== g.fingers) restart(fingers);
      },
      onPanResponderMove: (evt, gs) => {
        const fingers = fingersDown(evt);
        if (fingers.length > 1) g.multi = true;
        g.moved = Math.max(g.moved, Math.hypot(gs.dx, gs.dy));
        follow(fingers);
      },
      // A finger lifted while another stays down.
      onPanResponderEnd: (evt) => {
        const fingers = fingersDown(evt, true);
        if (fingers.length > 0 && fingers.length !== g.fingers) restart(fingers);
      },
      onPanResponderRelease: () => {
        g.fingers = 0;
        g.start = null;
        const tap = !g.multi && g.moved < TAP_MAX_MOVE && Date.now() - g.tapAt < TAP_MAX_MS;
        if (tap) {
          // A tap on the photo, or any tap while zoomed, does nothing.
          if (g.s <= MIN_SCALE + AT_REST && !insidePhoto(g.tapX, g.tapY)) close();
          return;
        }
        settle();
      },
      onPanResponderTerminate: () => {
        g.fingers = 0;
        g.start = null;
        settle();
      },
    });
  }

  // A new photo, or the viewer closed from outside: start again at 1x.
  useEffect(() => {
    reset();
  }, [uri]);

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={close}>
      <View
        style={styles.backdrop}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          g.screen = { w: width, h: height };
        }}
        {...responder.current.panHandlers}
      >
        <Animated.View
          style={[
            styles.imageWrap,
            { transform: [{ translateX: shiftX }, { translateY: shiftY }, { scale }] },
          ]}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            g.box = { x, y, w: width, h: height };
          }}
        >
          {uri && (
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
              onLoad={(e) => {
                const src = e.nativeEvent?.source;
                if (src?.width && src?.height) g.natural = { uri, w: src.width, h: src.height };
              }}
            />
          )}
        </Animated.View>
        <TouchableOpacity
          onPress={close}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrap: { width: '92%', height: '75%' },
  image: { width: '100%', height: '100%' },
  closeButton: { position: 'absolute', top: 50, right: 24 },
});
