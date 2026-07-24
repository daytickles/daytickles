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
export const ACCENT_THEMES = [
  { id: "rust", name: "Rust", card: "#F0997B", moods: ["#6B4530", "#8C5A3C", "#D9784A", "#FFB35C"] },
  { id: "sage", name: "Sage", card: "#AEC49A", moods: ["#41492F", "#5C6B45", "#8FA36B", "#C9DE9A"] },
  { id: "dusk", name: "Dusk Blue", card: "#9FB8C8", moods: ["#2E4450", "#3F5A6B", "#6D93A8", "#A8D4E8"] },
  { id: "mauve", name: "Mauve", card: "#C79CB0", moods: ["#4F2E3D", "#6B3F53", "#A3617E", "#E8A8C4"] },
  { id: "ochre", name: "Ochre", card: "#D9B35C", moods: ["#5C4416", "#7A5A1E", "#BF8B2E", "#F5CF6B"] },
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

// Distinguishable dot colors for Goals — deliberately a SEPARATE small
// palette from both the mood ramp and the accent themes, so a goal tag
// never gets visually confused with mood intensity or the app's accent.
// This is NOT the same palette currently used in goals.js
// (#EF4444/#F97316/etc. — generic saturated web colors) — those don't
// match the app's muted 70s identity and should be swapped for these.
export const GOAL_COLORS = ["#B5442E", "#3E7A57", "#3A5A8C", "#8A5A9E", "#B8862E"];
export const MAX_GOALS = 5;

// Motion parameters per mood intensity: bigger smile = faster, bigger
// motion. Used by the entry animation (not yet built in the router app).
export const MOOD_MOTION = {
  hint: { duration: 2200, amplitude: 2, spinDuration: 12000 },
  warm: { duration: 1600, amplitude: 5, spinDuration: 8000 },
  good: { duration: 1000, amplitude: 9, spinDuration: 5000 },
  big: { duration: 600, amplitude: 16, spinDuration: 2800 },
};
