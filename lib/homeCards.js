// lib/homeCards.js
//
// Which Home deck cards a user has switched on (profiles.home_cards,
// migration 0080), set from Settings' Home cards card or Home's Pick your
// cards sheet. Off only hides the card from Home's deck; the feature and
// its data stay.
//
// The column is a comma-separated list of the cards that are ON, kept as
// plain text so AuthContext's === compare (RENDER_RELEVANT_FIELDS) works.
// '' means every card is off, and unknown keys are ignored. A key not in
// a saved list is off, so a card added later (Polaroids sent, Your
// trackers) stays off for everyone until they switch it on.
//
// null means "hasn't chosen yet". Migration 0080 gave every account that
// existed then an explicit list, so only a new account has null: Home
// shows its Pick your cards card instead of the deck (homeCardsChosen),
// no card is on (homeCardsFor), and Settings shows every switch off.
// While the profile itself hasn't loaded yet, homeCardsFor still gives
// DEFAULT_HOME_CARDS and homeCardsChosen says chosen, so an existing
// account's Home never flashes the Pick your cards card. The same goes
// for a profile with no home_cards field at all (undefined: migration
// 0080 not applied yet) -- only a real null means "not chosen".

// The card keys, in the deck's order (the same keys as HomeDeck's cards
// and DECK_COLORS).
export const HOME_CARD_KEYS = ['remember', 'goals', 'rewards', 'multickles', 'rnrs', 'dayDots', 'polaroids', 'trackers'];

// On while the profile hasn't loaded yet (see above). Polaroids sent and
// Your trackers are not among them.
export const DEFAULT_HOME_CARDS = ['remember', 'goals', 'rewards', 'multickles', 'rnrs', 'dayDots'];

// The rows Settings' Home cards card and Home's Pick your cards sheet
// (components/PickCardsSheet.js) show, in the deck's order (HOME_CARD_KEYS): each card's name and
// one-line description. offNote is the small line under a row in
// Settings while it's off, for the cards that are the only way into their
// feature; onNote is the line under it while it's on. Pick your cards
// shows neither.
export const HOME_CARD_ROWS = [
  { key: 'remember', name: 'Remember this?', description: 'An older Tickle, resurfaced' },
  {
    key: 'goals', name: 'Your Goals', description: 'Tickles tagged to each Goal',
    offNote: "Off: Goal summaries can't be opened until you turn this back on.",
  },
  { key: 'rewards', name: 'My Rewards', description: 'What your tokens can redeem' },
  { key: 'multickles', name: 'Blogbits', description: 'The ones still going' },
  { key: 'rnrs', name: 'Nudges & Notes', description: "Today's reminders" },
  {
    key: 'dayDots', name: 'How bright is your day?', description: 'Day Dots',
    offNote: "Off: you can't dot your day until you turn this back on.",
  },
  { key: 'polaroids', name: 'Polaroids sent', description: 'Polaroids you sent from Tickle Pics' },
  {
    key: 'trackers', name: 'Your trackers', description: 'Track anything you choose. Starts empty.',
    onNote: 'Your trackers card starts empty. Add a name and rate it each day. Only you can see your trackers. They are not shared and not shown in Your Week.',
    offNote: "Off: you can't rate or see your trackers until you turn this back on. Nothing is deleted.",
  },
];

// { remember: bool, goals: bool, ... } for the profile: DEFAULT_HOME_CARDS
// while there's no profile yet (or no home_cards field), every card off
// while home_cards is null (not chosen yet), otherwise the saved list.
export function homeCardsFor(profile) {
  let on;
  if (!profile || profile.home_cards === undefined) on = new Set(DEFAULT_HOME_CARDS);
  else if (profile.home_cards == null) on = new Set();
  else on = new Set(profile.home_cards.split(',').map((k) => k.trim()).filter((k) => HOME_CARD_KEYS.includes(k)));
  return Object.fromEntries(HOME_CARD_KEYS.map((key) => [key, on.has(key)]));
}

// False only once the profile has loaded and home_cards is really null:
// the account hasn't picked its cards yet (Home's Pick your cards card).
export function homeCardsChosen(profile) {
  return !profile || profile.home_cards !== null;
}

// The text to save for a { key: bool } map, in the deck's order.
export function homeCardsValue(cards) {
  return HOME_CARD_KEYS.filter((key) => cards[key]).join(',');
}
