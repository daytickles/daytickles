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

// accent color used app-wide.
export const ACCENT_THEMES = [
  { id: "rust", name: "Rust", card: "#F0997B" },
  { id: "sage", name: "Sage", card: "#AEC49A" },
  { id: "dusk", name: "Dusk Blue", card: "#9FB8C8" },
  { id: "mauve", name: "Mauve", card: "#C79CB0" },
  { id: "ochre", name: "Ochre", card: "#D9B35C" },
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

// Diameter of the small vibe-icon slot on an already-saved entry (Tickle Stash/
// Calendar/Home/Weekly Summary) -- matches the design mockups for that
// context.
export const SAVED_ENTRY_DOT_SIZE = 14;

// Icon per tickle_nature value — icon, not color, is the distinguishing
// signal here, since color is already spoken for by mood and goals.
// Deliberately non-circular glyphs so this reads as distinct from the
// goal-tag dot at a glance, not just another colored circle.
//
// { library, name } rather than a bare name string -- "given" reaches
// into MaterialCommunityIcons for hand-heart-outline (checked the real
// glyph maps directly: Ionicons has no hand+heart glyph and no "give"
// glyph at all, only gift/gift-outline, which read less specifically
// as "paying forward" than a literal giving gesture does). Same
// one-off library exception FoundingMemberBadge already takes for its
// crown glyph, for the same reason (checked the actual glyph map, not
// guessed) -- received/self stay on Ionicons since balloon-outline/
// cafe-outline already exist there. Always render via NatureIcon
// (components/NatureIcon.js), never a raw <Ionicons name={...}>, so
// this library switch lives in exactly one place.
export const TICKLE_NATURE_ICONS = {
  received: { library: 'ionicons', name: 'balloon-outline' },
  given: { library: 'material-community', name: 'hand-heart-outline' },
  self: { library: 'ionicons', name: 'cafe-outline' },
};

// Fixed display order for anywhere the three nature categories render
// as a row (Home's self-care badges, Calendar's Vibes tab icons, the
// new Weekly Summary breakdown) -- iterating a Set/object directly
// would follow arbitrary insertion/query order instead of always
// reading balloon/thumbs-up/cafe left to right.
export const NATURE_ORDER = ['received', 'given', 'self'];

// Vibe card colors (Home Vibes redesign) -- one solid, fixed color per
// nature category, deliberately NOT accent-tinted (each vibe keeps its
// own recognizable identity regardless of the viewer's chosen theme).
// Hue-verified 2026-08-13 against every chromatic color in this file:
// - received: reuses C.teal directly, unchanged. No new teal-green
//   color could clear real separation from C.teal/GOAL_COLORS' teal/
//   C.tealText -- that whole band is already saturated (best
//   alternative found was only 14-25 deg clear, and would've read as
//   plain green rather than teal-green anyway). Rather than ship a
//   near-duplicate, reuse C.teal as-is -- it already carries a related
//   "warmth/connection" meaning elsewhere (likes, favorites, the
//   Connection section on Weekly Summary), so reuse here doesn't
//   introduce a new clash, just extends an existing one deliberately.
// - self: reuses C.amberBg directly, unchanged -- the former Tickles
//   stat card color, freed up by this same redesign replacing that
//   card. No adjacency conflict with the nearby amberDark-bordered
//   pinned-entry card on Home -- different job (a highlighted single
//   entry, not another stat count).
// - given: new dedicated purple, H=250 S=50% L=48%. Best achievable
//   candidate anywhere in the purple/violet range -- 19.8 deg clear of
//   the nearest existing color (GOAL_COLORS' violet, H=270), the
//   widest clearance available in that band given how crowded it
//   already is. Reads as blue-violet rather than a pure purple --
//   accepted as the real tradeoff for genuine separation; does NOT
//   clear the usual 30 deg target (nothing in this hue range does).
//
// Vibe-to-color assignment (received=teal / given=purple / self=amber)
// is a default pick, not load-bearing -- easily reassigned by editing
// this object alone.
export const VIBE_COLORS = {
  received: C.teal,
  given: '#523DB8',
  self: C.amberBg,
};

// Shared display labels per nature category -- distinct from create.js's
// own TICKLE_NATURE_OPTIONS (that array is presentation-only for its
// picker's exact button copy/casing). This is the one other place a
// Vibe needs a plain-English label with no picker context of its own:
// a photo-only Tickle's Polaroid caption (EntryCard.js).
export const NATURE_LABELS = {
  received: 'Made me smile',
  given: 'I paid forward',
  self: 'For me',
};

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
// below -- originally accepted because each award also carried a
// distinct icon shape as a backstop; that backstop is gone now that
// every award uses the same hand icon (2026-08-29), but the two colors
// were never adjacent to EACH OTHER (56+ deg apart, see
// AWARD_BADGE_COLOR below) or to anything sharing an award's own screen
// context (GOAL_COLORS appears only in Goals, never alongside an award
// icon) -- kept as-is on that basis, not re-verified from scratch.
export const AWARD_TYPES = {
  wordweaver: {
    label: "Wordweaver",
    description: "Beautifully written",
    color: "#3E7CE0",
  },
  soulweaver: {
    label: "Soulweaver",
    description: "Emotionally moving",
    color: "#7C2B82",
  },
  wittweaver: {
    label: "Wittweaver",
    description: "Funny or clever",
    color: "#E25068",
  },
};
export const AWARD_ORDER = ["wordweaver", "soulweaver", "wittweaver"];

// Single icon shape used everywhere a High Five shows -- the public
// badge (EntryCard), the private "you gave/received" icon (EntryCard),
// Weekly Summary's High Fives cards, and the give-award picker. Matches
// the outline variant already used for the not-yet-given state
// (EntryCard's "hand-right-outline"). Color, not shape, now carries
// which type it is (AWARD_TYPES[type].color) -- a deliberate reversal
// of the old book/heart/flash-per-type shapes (2026-08-29), since
// giving/receiving a High Five is meant to be visible and celebratory,
// not disguised.
export const AWARD_HAND_ICON = "hand-right";

// Public "this post received some recognition" background accent
// (border stripe + wash on EntryCard) -- ONE shared, type-agnostic
// color for that card-level treatment. This same color used to paint
// the badge ICON too, specifically so the public badge could never
// hint at which award was given (see migration 0021's original
// comment) -- that privacy-by-design choice was a deliberate product
// reversal on 2026-08-29 (migration 0054): giving/receiving a High
// Five is meant to be celebratory and worth surfacing, not kept quiet,
// so the badge icon now renders in the real per-type color
// (AWARD_TYPES above) instead of this one. This constant survives only
// as the card's shared stripe/wash accent, unrelated to award identity.
// Gold/amber was an explicit choice to accept overlap with the existing
// sparkle/highlight family (C.sparkleBg/sparkleText, C.amberDark/
// amberBg) -- "recognition badge" reads as a different enough purpose
// from "highlighted content" that reuse was judged acceptable, unlike
// the Award colors themselves. Same hue-verification pass as those three:
// H=46 deg is only 1.6 deg from C.amberBg in raw hue (expected/accepted
// per that decision) but 14.5 deg clear of the nearest color OUTSIDE
// that family (GOAL_COLORS' olive) and 56+ deg from all three Award
// colors -- kept visually distinct from the bright/vivid existing
// ambers via a much deeper, more muted L/S register instead (same
// differentiate-by-lightness approach used for Soulweaver vs. GOAL's
// magenta).
export const AWARD_BADGE_COLOR = "#816918";

// Founding Member badge (FM26-style pill, permanent identity marker
// -- see supabase/migrations/0022+) -- deliberately its own color, not
// a reuse of AWARD_BADGE_COLOR, per the spec: Awards are a per-post
// recognition event, Founding Member is a permanent identity marker,
// different enough concepts to want a different color. Same hue-
// verification pass as GOAL_COLORS/AWARD_TYPES/AWARD_BADGE_COLOR:
// computed HSL against every chromatic color in this file (mood ramp
// x5 themes, GOAL_COLORS, AWARD_TYPES, AWARD_BADGE_COLOR) plus C.error
// and the reserved-but-unverified Pop Colors candidates. H=142
// (deep forest green) sits in the single most open stretch of the
// entire wheel: 17.8 deg clear of the nearest REAL shipped color
// (C.teal) and 50-63 deg clear of the Sage family -- even the
// unverified Pop Color "Hunter Green" candidate is only 15.9 deg away,
// comparable to or better than several already-accepted precedents
// above (Soulweaver 9.0 deg, Wordweaver 13.2 deg). Deliberately deep/
// muted (S=61, L=22, not a bright/vivid green) to match this app's
// 70s-jewel-tone register and to clear WCAG contrast comfortably:
// 7.52:1 against light text (#FBF3E7), well past AA's 4.5:1 and above
// AWARD_BADGE_COLOR's own 4.81:1.
export const FOUNDING_MEMBER_BADGE_COLOR = "#165a2f";

// Founding Member HERO CARD (post-launch addendum item 2) -- a large
// background surface, so it needs its own identity color rather than
// reusing FOUNDING_MEMBER_BADGE_COLOR's green (that's the small crown
// pill's color, deliberately chosen to sit far from the amber/gold
// family) or the viewer's own accent theme (defeats the point of
// being recognizable branding regardless of which theme someone's
// picked). The spec calls for amber/gold specifically, though: unlike
// FOUNDING_MEMBER_BADGE_COLOR's easy 17.8 deg-clear win in green, the
// 25-55 deg gold/amber band is the most crowded part of this file's
// wheel (amberDark, amberBg, sparkleBg/Text, all four Ochre mood
// shades, AWARD_BADGE_COLOR itself) -- true 15-30 deg separation isn't
// achievable while staying recognizably gold. Same tradeoff
// AWARD_BADGE_COLOR's own comment already accepted for its 1.6 deg
// overlap with amberBg: differentiate by L/S register instead of hue.
// H=51.5 (yellower than AWARD_BADGE_COLOR's H=46.3 olive-gold) is 5.2
// deg clear of it, 15.5 deg clear of amberDark, 90.6 deg clear of
// FOUNDING_MEMBER_BADGE_COLOR. L=26 (not the initially-picked L=30,
// #8C7A0D) so the WCAG contrast against the light text textOn() picks
// for it (#FBF3E7) clears AA's 4.5:1 minimum -- 4.92:1, vs only 3.89:1
// at L=30, which failed against both available text colors.
export const FOUNDING_MEMBER_HERO_COLOR = "#796A0B";
