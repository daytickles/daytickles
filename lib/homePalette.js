// lib/homePalette.js
//
// Home colour sets, chosen per account (profiles.home_palette, migration
// 0079). Each set has six deck colours in the existing DECK_COLORS slot
// keys (remember, goals, rewards, multickles = Blogbits, rnrs = Nudges &
// Notes, dayDots = Day Dots); the Polaroids sent card reuses the Blogbits
// colour (multickles), so it has no slot of its own. The three Vibe
// cards take received = goals, given = multickles,
// self = rewards. Cream text (DECK_TEXT / DECK_SUBTEXT) stays on every set.
//
// Classic is today's look, read by reference from DECK_COLORS and
// VIBE_CARD_PALETTES.muted so it can never drift from them. It's also
// what a null, 'classic' or unknown home_palette gets -- including while
// the profile is still loading.
import { DECK_COLORS, deckRowFill } from '../components/HomeDeck';
import { VIBE_CARD_PALETTES } from './theme';
import { useAuth } from '../contexts/AuthContext';

export const DEFAULT_HOME_PALETTE_ID = 'classic';

// The order the Settings picker shows them in.
export const HOME_PALETTES = [
  {
    id: 'classic',
    name: 'Classic',
    deck: DECK_COLORS,
    vibe: VIBE_CARD_PALETTES.muted.colors,
  },
  {
    id: 'plum_gold',
    name: 'Plum & Gold',
    deck: { remember: '#684C14', goals: '#1A595B', rewards: '#3B4F86', multickles: '#723D72', rnrs: '#813850', dayDots: '#4F5A2B' },
  },
  {
    id: 'forest_clay',
    name: 'Forest & Clay',
    deck: { remember: '#3E5643', goals: '#634D21', rewards: '#7D3E3B', multickles: '#544A72', rnrs: '#2E594B', dayDots: '#37526F' },
  },
  {
    id: 'berry_teal',
    name: 'Berry & Teal',
    deck: { remember: '#863838', goals: '#1D5951', rewards: '#654D1D', multickles: '#7B3C5B', rnrs: '#803950', dayDots: '#3F4C80' },
  },
];

// The six deck slots, in the deck's order (for the picker's dots).
// Polaroids sent has none: it takes the Blogbits (multickles) colour.
export const HOME_PALETTE_SLOTS = ['remember', 'goals', 'rewards', 'multickles', 'rnrs', 'dayDots'];

// Each set worked out once: its Vibe colours (Classic keeps the muted
// set's own object; the others take them from their deck slots) and its
// row fills. Built at load, so every caller gets the same objects back.
const RESOLVED = Object.fromEntries(
  HOME_PALETTES.map((p) => {
    const vibe = p.vibe || { received: p.deck.goals, given: p.deck.multickles, self: p.deck.rewards };
    const rowFill = Object.fromEntries(
      Object.entries(p.deck).map(([key, color]) => [key, { backgroundColor: deckRowFill(color) }])
    );
    return [p.id, { id: p.id, name: p.name, deck: p.deck, vibe, rowFill }];
  })
);

// { id, name, deck, vibe, rowFill } for the profile's chosen set, or
// Classic for a null, 'classic' or unknown id (or no profile yet).
export function homePaletteFor(profile) {
  return RESOLVED[profile?.home_palette] || RESOLVED[DEFAULT_HOME_PALETTE_ID];
}

// The signed-in user's set.
export function useHomePalette() {
  const { profile } = useAuth();
  return homePaletteFor(profile);
}
