// components/HomeCardsGhost.js
//
// What Home shows in the deck's place when there are no cards to show:
//   PickCardsGhost -- a new account that hasn't picked its cards yet
//                     (profiles.home_cards null, lib/homeCards.js
//                     homeCardsChosen): a dashed stand-in card the deck's
//                     own size and radius, with two dashed cards tilted
//                     behind it like the deck's pile. No swipe, no pager
//                     dots, no header +. Its button opens the Pick your
//                     cards sheet (components/PickCardsSheet.js).
//   NoCardsBox     -- every card switched off: a short dashed box with an
//                     outlined button that opens the same sheet.
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { deckCardHeight, DECK_CARD_RADIUS } from './HomeDeck';

const INK = '#4A1F10';
const CREAM = '#FBF3E7';
const BODY = '#5F5B52';
const ON_INK = '#FFF8EC';

// The pile behind the front card: tilt, dash colour and fill.
const BACK_CARDS = [
  { rotate: '7deg', border: 'rgba(74,31,16,0.2)', fill: 'rgba(74,31,16,0.03)' },
  { rotate: '-4deg', border: 'rgba(74,31,16,0.26)', fill: 'rgba(74,31,16,0.04)' },
];

export function PickCardsGhost({ width, fitHeight, onPick }) {
  const { fontScale } = useWindowDimensions();
  const height = deckCardHeight(fitHeight, fontScale || 1);
  return (
    <View style={[styles.ghostWrap, { width, height }]}>
      {BACK_CARDS.map((b) => (
        <View
          key={b.rotate}
          style={[styles.ghostCard, styles.backCard, { borderColor: b.border, backgroundColor: b.fill, transform: [{ rotate: b.rotate }] }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        />
      ))}
      <View style={[styles.ghostCard, styles.frontCard]}>
        <Text style={styles.ghostTitle} accessibilityRole="header">Pick your cards</Text>
        <Text style={styles.ghostBody}>Choose what you want to see on Home. You can change this any time.</Text>
        <TouchableOpacity
          style={styles.ghostButton}
          onPress={onPick}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Pick your cards"
        >
          <Text style={styles.ghostButtonText}>Pick your cards</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function NoCardsBox({ width, onPick }) {
  return (
    <View style={[styles.noneBox, { width }]}>
      <Text style={styles.noneTitle}>No cards on Home</Text>
      <Text style={styles.noneBody}>Turn some on any time in Settings, Home cards.</Text>
      <TouchableOpacity
        style={styles.noneButton}
        onPress={onPick}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Pick your cards"
      >
        <Text style={styles.noneButtonText}>Pick your cards</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  ghostWrap: { alignSelf: 'center' },
  ghostCard: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DECK_CARD_RADIUS,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  backCard: {},
  frontCard: {
    borderColor: 'rgba(74,31,16,0.4)',
    backgroundColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ghostTitle: { fontSize: 22, lineHeight: 27, fontWeight: '700', color: INK, textAlign: 'center' },
  ghostBody: { fontSize: 14.5, lineHeight: 20, color: BODY, textAlign: 'center', marginTop: 6 },
  ghostButton: {
    marginTop: 16, height: 48, paddingHorizontal: 28, borderRadius: 24,
    backgroundColor: INK, alignItems: 'center', justifyContent: 'center',
  },
  ghostButtonText: { fontSize: 16, fontWeight: '700', color: ON_INK },

  noneBox: {
    alignSelf: 'center', alignItems: 'center',
    borderRadius: DECK_CARD_RADIUS, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(74,31,16,0.3)',
    paddingVertical: 24, paddingHorizontal: 20,
  },
  noneTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: INK, textAlign: 'center' },
  noneBody: { fontSize: 14, lineHeight: 20, color: BODY, textAlign: 'center', marginTop: 4 },
  noneButton: {
    marginTop: 14, height: 44, paddingHorizontal: 22, borderRadius: 22,
    borderWidth: 1.5, borderColor: INK, alignItems: 'center', justifyContent: 'center',
  },
  noneButtonText: { fontSize: 15, fontWeight: '600', color: INK },
});
