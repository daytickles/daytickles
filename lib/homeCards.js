// lib/homeCards.js
//
// Which Home deck cards a user has switched on (profiles.home_cards,
// migration 0080), set from Settings' Home cards card. Off only hides the
// card from Home's deck; the feature and its data stay.
//
// The column is a comma-separated list of the cards that are ON, kept as
// plain text so AuthContext's === compare (RENDER_RELEVANT_FIELDS) works.
// null means the defaults (the first six cards), '' means every card is
// off, and unknown keys are ignored. A key not in a saved list is off, so
// a card added later (Polaroids sent, Your trackers) stays off for
// everyone until they switch it on.

// The card keys, in the deck's order (the same keys as HomeDeck's cards
// and DECK_COLORS).
export const HOME_CARD_KEYS = ['remember', 'goals', 'rewards', 'multickles', 'rnrs', 'dayDots', 'polaroids', 'trackers'];

// On when home_cards is null. Polaroids sent and Your trackers are off by
// default.
export const DEFAULT_HOME_CARDS = ['remember', 'goals', 'rewards', 'multickles', 'rnrs', 'dayDots'];

// { remember: bool, goals: bool, ... } for the profile, the defaults when
// there's no profile or no saved choice yet.
export function homeCardsFor(profile) {
  const value = profile?.home_cards;
  const on = new Set(
    value == null
      ? DEFAULT_HOME_CARDS
      : value.split(',').map((k) => k.trim()).filter((k) => HOME_CARD_KEYS.includes(k))
  );
  return Object.fromEntries(HOME_CARD_KEYS.map((key) => [key, on.has(key)]));
}

// The text to save for a { key: bool } map, in the deck's order.
export function homeCardsValue(cards) {
  return HOME_CARD_KEYS.filter((key) => cards[key]).join(',');
}
