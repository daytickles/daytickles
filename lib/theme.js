// lib/theme.js
//
// The actual DayTickles design system, extracted from the working
// prototype (App.js) so every real screen can import and use it
// directly — rather than each new screen reinventing generic styling
// from scratch, which is what happened with the current goals.js.

export const C = {
  bg: "#FBF3E7",
  bgOuter: "#EDE4D3",
  rust: "#7A3B1A",
  rustDark: "#4A1B0C",
  coral: "#F0997B",
  amberDark: "#EF9F27",
  amberBg: "#F9CB42",
  amberText: "#412402",
  teal: "#5DCAA5",
  tealText: "#04342C",
  sparkleBg: "#FBEAD0",
  sparkleText: "#8A5A12",
  // Dedicated error/warning tone — a warm, muted red distinct from
  // `rust` (which doubles as general link/status text app-wide) and from
  // `coral`/GOAL_COLORS' brick red, so an actual error state reads as
  // unambiguously different from those.
  error: "#B3392C",
  card: "#FFFFFF",
  border: "#E8DCC8",
  text: "#2C2C2A",
  subtext: "#888780",
  faint: "#B4B2A9",
};

// Soft, muted, 70s-inspired accent themes. Each person picks one at
// setup (changeable anytime in Settings) — it sets the background/card
// accent AND the 4-step mood-intensity ramp. `moods` goes from muted/
// quiet (small smile) to vivid/bright (big grin) — brightness increases
// with intensity, deliberately not the other way round.
// Levels 0-1 were originally near-charcoal at every theme's low end,
// reading as "dark" rather than "this theme's hue, softly" — level 0/1
// values below are lighten()'d (0.35/0.2) from those originals to raise
// the floor. Sage/Dusk/Mauve's lightened level-0 still came out too
// close to gray (channel spread only ~0.12-0.16 of max), so those three
// also got a mean-preserving saturation boost (each channel pushed
// further from the trio's average); Rust/Ochre's spread was already
// wide enough (~0.25-0.3) without it. Levels 2-3 are untouched — already
// read as clearly bright/cheerful.
export const ACCENT_THEMES = [
  { id: "rust", name: "Rust", card: "#F0997B", moods: ["#9F8678", "#A37B63", "#D9784A", "#FFB35C"] },
  { id: "sage", name: "Sage", card: "#AEC49A", moods: ["#858D73", "#7D896A", "#8FA36B", "#C9DE9A"] },
  { id: "dusk", name: "Dusk Blue", card: "#9FB8C8", moods: ["#718692", "#657B89", "#6D93A8", "#A8D4E8"] },
  { id: "mauve", name: "Mauve", card: "#C79CB0", moods: ["#937281", "#896575", "#A3617E", "#E8A8C4"] },
  { id: "ochre", name: "Ochre", card: "#D9B35C", moods: ["#958568", "#957B4B", "#BF8B2E", "#F5CF6B"] },
];
export function accentFor(id) {
  return ACCENT_THEMES.find((t) => t.id === id) || ACCENT_THEMES[0];
}

// Picks a readable text color for a given background hex, via relative
// luminance — dark text on light backgrounds, light text on dark ones.
export function textOn(hex) {
  if (!hex) return C.rustDark;
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? C.rustDark : "#FBF3E7";
}

// Darkens a hex color by scaling each RGB channel toward 0 — used to
// derive a readable button/accent shade from a person's chosen accent
// card color rather than hardcoding one fixed brand color everywhere.
export function darken(hex, amount = 0.35) {
  if (!hex) return hex;
  const c = hex.replace("#", "");
  const scale = Math.min(1, Math.max(0, 1 - amount));
  const channel = (start) => {
    const value = parseInt(c.substring(start, start + 2), 16) * scale;
    return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

// Lightens a hex color by interpolating each RGB channel toward 255 —
// darken()'s mirror image, for decorative tints (e.g. a sunburst behind
// the streak number) that need to read as a highlight ON TOP OF that
// same accent color rather than a readable foreground shade.
export function lighten(hex, amount = 0.35) {
  if (!hex) return hex;
  const c = hex.replace("#", "");
  const scale = Math.min(1, Math.max(0, amount));
  const channel = (start) => {
    const base = parseInt(c.substring(start, start + 2), 16);
    const value = base + (255 - base) * scale;
    return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

// Converts a hex color to an rgba() string at the given opacity — for
// decorative overlays where a semi-transparent version of a solid
// theme color is needed (React Native has no shorthand for this).
export function withAlpha(hex, alpha) {
  if (!hex) return hex;
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Smile intensity scale — four points, sizes grow with intensity, color
// comes from the person's accent theme (see moodColorFor), not a fixed
// hue.
export const MOODS = [
  { id: "hint", label: "hint of a smile", size: 10, level: 0 },
  { id: "warm", label: "warm smile", size: 16, level: 1 },
  { id: "good", label: "good smile", size: 22, level: 2 },
  { id: "big", label: "big grin", size: 28, level: 3 },
];
export function moodColorFor(moodId, accent) {
  const m = MOODS.find((x) => x.id === moodId) || MOODS[2];
  return (accent || ACCENT_THEMES[0]).moods[m.level];
}

// Explicit target sizes (indexed by MOODS' level) for the small inline
// dot on an already-saved entry card in Home/Feed — distinct from
// MOODS' own size, which is tuned for create.js's larger tappable
// picker dots. Doesn't reduce to one clean formula from those sizes, so
// this is a direct lookup rather than an approximated scale factor.
const ENTRY_DOT_SIZES = [10, 13, 18, 23];
export function moodDotSize(moodId) {
  const m = MOODS.find((x) => x.id === moodId) || MOODS[2];
  return ENTRY_DOT_SIZES[m.level];
}

// Ionicons name per tickle_nature value — icon, not color, is the
// distinguishing signal here, since color is already spoken for by
// mood and goals. Deliberately non-circular glyphs so this reads as
// distinct from the goal-tag dot at a glance, not just another colored
// circle.
export const TICKLE_NATURE_ICONS = {
  received: "balloon-outline",
  given: "thumbs-up-outline",
  self: "cafe-outline",
};

// Fixed display order for anywhere the three nature categories render
// as a row (Home's self-care badges, Calendar's Vibes tab icons, the
// new Weekly Summary breakdown) -- iterating a Set/object directly
// would follow arbitrary insertion/query order instead of always
// reading balloon/thumbs-up/cafe left to right.
export const NATURE_ORDER = ['received', 'given', 'self'];

// Distinguishable dot colors for Goals — deliberately a SEPARATE small
// palette from both the mood ramp and the accent themes, so a goal tag
// never gets visually confused with mood intensity or the app's accent.
// goals.js imports and uses this array directly (color picker, dots,
// used-color tracking) — there is no separate hardcoded palette there.
// Deliberately bright/saturated (vibrancy similar to #EF4444/#F97316),
// a departure from the muted 70s palette used everywhere else — this
// dot renders at only 16x16px (goalDot below), where hue separation
// carries legibility far better than subtle luminance/saturation
// gradation does. Checked against every mood-ramp hue from 96152ba plus
// C.error. Amber (slot 1) is the one deliberate exception to the
// otherwise-30°+ mutual-separation standard: the only open space near
// yellow/orange is the ~35°-wide gap between Ochre and Sage's mood
// hues, too narrow to give any point 30° clearance from both — 17.5°
// from each is the ceiling there, not a rounding-down from something
// better. Shipping it anyway as a real-world test with actual testers
// rather than resolving it through more hue math. The other four
// (Teal/Blue/Violet/Magenta) all clear 27°+ from every mood/error hue
// and 34-106° from each other.
export const GOAL_COLORS = ["#868811", "#14A384", "#4D66E6", "#9449DF", "#E236D4"];
export const MAX_GOALS = 5;

// The three Award types (a permanent, one-time recognition layered on
// top of an existing favorite -- see migration 0020). Colors were hue-
// verified the same way GOAL_COLORS/Pop Colors were: computed HSL
// against every existing chromatic color in this file (mood ramp x5
// themes, GOAL_COLORS, the reserved Pop Colors palette) plus C.error.
// The literal "coral-orange" originally asked for Wittweaver turned out
// unachievable -- the 0-45 deg band is the single most claimed part of
// the wheel (rust/amber/ochre themes + C.error), best case only ~5 deg
// from C.error itself (the delete/destructive color) -- so it was
// rotated to a warm rose/pink instead, which clears a real 15.7 deg gap.
// Wordweaver (13.2 deg from GOAL_COLORS' blue) and Soulweaver (9.0 deg
// from GOAL_COLORS' magenta, deliberately kept at a darker/deeper L than
// magenta's brighter register) are both tighter than the Amber exception
// below -- accepted because, unlike a plain dot, each award also carries
// a distinct icon shape, so hue closeness alone can't cause a mix-up.
export const AWARD_TYPES = {
  wordweaver: {
    label: "Wordweaver",
    description: "Beautifully written",
    color: "#3E7CE0",
    icon: "book-outline",
    iconActive: "book",
  },
  soulweaver: {
    label: "Soulweaver",
    description: "Emotionally moving",
    color: "#7C2B82",
    icon: "heart-outline",
    iconActive: "heart",
  },
  wittweaver: {
    label: "Wittweaver",
    description: "Funny or clever",
    color: "#E25068",
    icon: "flash-outline",
    iconActive: "flash",
  },
};
export const AWARD_ORDER = ["wordweaver", "soulweaver", "wittweaver"];

// Public "this post received some award" indicator (border stripe +
// badge icon on EntryCard) -- deliberately ONE shared color, not one of
// the three above, so it can never hint at which award was actually
// given (that stays private, see migration 0021's awarded_entries view,
// which only ever exposes entry_id, never award_type). Gold/amber was
// an explicit choice to accept overlap with the existing sparkle/
// highlight family (C.sparkleBg/sparkleText, C.amberDark/amberBg) --
// "recognition badge" reads as a different enough purpose from
// "highlighted content" that reuse was judged acceptable, unlike the
// Award colors themselves. Same hue-verification pass as those three:
// H=46 deg is only 1.6 deg from C.amberBg in raw hue (expected/accepted
// per that decision) but 14.5 deg clear of the nearest color OUTSIDE
// that family (GOAL_COLORS' olive) and 56+ deg from all three Award
// colors -- kept visually distinct from the bright/vivid existing
// ambers via a much deeper, more muted L/S register instead (same
// differentiate-by-lightness approach used for Soulweaver vs. GOAL's
// magenta).
export const AWARD_BADGE_COLOR = "#816918";

// Motion parameters per mood intensity: bigger smile = faster, bigger
// motion. Used by the entry animation (not yet built in the router app).
export const MOOD_MOTION = {
  hint: { duration: 2200, amplitude: 2, spinDuration: 12000 },
  warm: { duration: 1600, amplitude: 5, spinDuration: 8000 },
  good: { duration: 1000, amplitude: 9, spinDuration: 5000 },
  big: { duration: 600, amplitude: 16, spinDuration: 2800 },
};
