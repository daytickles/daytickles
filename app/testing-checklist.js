// app/testing-checklist.js
//
// TEMPORARY -- internal-testing checklist. No longer linked from
// Settings (its "Internal Testing" card was removed 2026-10-09); reachable
// only by the deep link daytickles://testing-checklist. Still TEMPORARY:
// delete this screen before public release.
//
// Checked state and scratch notes live in AsyncStorage only, under one
// key, per device -- throwaway tester state, never synced to Supabase.
// Item ids are stable strings rather than array indexes, so reordering
// or rewording an item here never reassigns someone's ticks.

import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, withAlpha } from '../lib/theme';
import WallpaperBackground from '../components/WallpaperBackground';

const STORAGE_KEY = 'daytickles-testing-checklist';

const SECTIONS = [
  {
    title: 'App lock',
    items: [
      { id: 'lock-set-pin', label: 'Set a PIN' },
      { id: 'lock-home-reopen', label: 'Background the app (Home button) and reopen' },
      { id: 'lock-sleep-wake', label: 'Put the device to sleep and wake it' },
      { id: 'lock-biometrics', label: 'Try biometrics' },
      { id: 'lock-forgot-pin', label: 'Try "Forgot PIN"' },
    ],
  },
  {
    title: 'Photos',
    items: [
      { id: 'photo-attach', label: 'Attach a photo to a Tickle' },
      { id: 'photo-create-photo-only', label: 'Create a Photo-Only Tickle (tap a Vibe icon on a Tickle Pics photo)' },
      { id: 'photo-pin', label: 'Pin a photo to Tickle Pics' },
      { id: 'photo-tickle-from-pinned', label: 'Write a Tickle from a pinned photo' },
      { id: 'photo-open-own', label: 'Open a photo full-screen on your own entry' },
      { id: 'photo-open-other-rippled', label: "Open a photo full-screen on someone else's Rippled entry (photo-attached text entry)" },
      { id: 'photo-open-other-polaroid', label: 'Open a photo-only Polaroid from someone else' },
      { id: 'photo-take-new', label: 'Take a new photo (camera)' },
      { id: 'photo-pick-gallery', label: 'Pick from gallery' },
      { id: 'photo-relink', label: 'Relink a missing photo (Find by name or Visual find)' },
      { id: 'photo-share-external', label: 'Share a photo externally (share sheet / Polaroid, e.g. WhatsApp)' },
      { id: 'photo-save-to-photos', label: 'Save a photo to device' },
    ],
  },
  {
    title: 'Blogbits',
    items: [
      { id: 'multickle-start-icon', label: 'Start one with an icon' },
      { id: 'multickle-tag-rippled', label: 'Tag a Rippled Tickle to it' },
      { id: 'multickle-follow-other', label: "Follow someone else's Blogbit" },
      { id: 'multickle-following-pills', label: "Check the Following tab pills (filter works, shows other authors' Tics)" },
      { id: 'multickle-home-plus-mine', label: 'On Home, Blogbits card, Mine: the + still opens Manage Blogbits' },
      { id: 'multickle-home-plus-find', label: 'On Follow, the + opens "Find a Blogbit": only ongoing Blogbits by other people that you do not follow and that have a public Tic; tap one to open its page and follow it from there' },
      { id: 'multickle-complete', label: 'Mark one Complete' },
      { id: 'multickle-ongoing-cap', label: 'Confirm the ongoing cap blocks correctly once at the limit' },
    ],
  },
  {
    title: 'Goals',
    items: [
      { id: 'goal-create', label: 'Create one' },
      { id: 'goal-tag-entry', label: 'Tag an entry to it' },
      { id: 'goal-achieve', label: 'Achieve one' },
      { id: 'goal-ordering', label: 'Confirm ordering (newest first, achieved last)' },
    ],
  },
  {
    title: 'Notifications',
    items: [
      { id: 'notif-trigger', label: 'Trigger one (e.g. have someone Ripple a Tic on a Blogbit you follow)' },
      { id: 'notif-tap', label: 'Tap it' },
    ],
  },
  {
    title: 'General',
    items: [
      { id: 'general-icon-splash', label: 'App icon/splash look right' },
      { id: 'general-dark-photo-tabbar', label: 'Nothing visually broken on a dark photo behind the tab bar' },
    ],
  },
  {
    title: 'Creating & managing Tickles',
    items: [
      { id: 'tickle-write-text', label: 'Write a text-only Tickle' },
      { id: 'tickle-edit', label: 'Edit a Tickle' },
      { id: 'tickle-delete', label: 'Delete a Tickle' },
      { id: 'tickle-ripple-unripple', label: 'Ripple a Tickle (make public) / Un-Ripple it (make private)' },
    ],
  },
  {
    title: 'Reactions & social',
    items: [
      { id: 'social-like', label: 'Like a Tickle' },
      { id: 'social-favourite', label: 'Favourite a Tickle (star)' },
      { id: 'social-high-five', label: 'Give each of the 6 High Five types' },
      { id: 'highfive-colours', label: 'The six High Five hands show the new colours (red, orange, yellow, green, blue, violet) with a thin darker outline, on Tickle cards, the picker, Notifications and Your Week' },
      { id: 'social-follow', label: 'Follow another user' },
      { id: 'social-view-profile', label: "View someone's profile" },
      { id: 'social-share', label: 'Share a Tickle (share sheet / Polaroid)' },
    ],
  },
  {
    title: 'Browsing',
    items: [
      { id: 'browse-stash-tabs', label: "Switch between Stash tabs (Mine, Fav's, Following, Rippled)" },
      { id: 'calendar-open-from-icon', label: 'Open the Calendar from the calendar icon at the top of Home (also on Tickle Stash and Tickle Pics; not shown on the Calendar itself)' },
      { id: 'calendar-no-token-circle', label: 'The token circle is gone from the top bar; your balance still shows next to My Rewards on Home (with the My Rewards card on)' },
      { id: 'browse-calendar-past-day', label: 'Browse the Calendar and tap into a past day' },
      { id: 'calendar-day-marks', label: 'Calendar: check a month with Day Dots answered, skipped and missing (open circle on days with Tickles only)' },
      { id: 'calendar-pills-open-close', label: 'Calendar: tap a day, open and close the Tickles and Goals pills' },
      { id: 'calendar-vibe-chips', label: 'Calendar: Tickles pill shows the right count for each Vibe and My Day' },
      { id: 'calendar-delete-updates', label: 'Calendar: delete a Tickle or change its Goal from the day list, and check the pill counts update' },
      { id: 'calendar-large-font', label: 'Calendar: check the pills and grid at the largest font size' },
      { id: 'browse-weekly-summary', label: 'Open Your Week' },
      { id: 'deck-plus-buttons', label: 'On Home, the Your Goals, My Rewards, Blogbits and Nudges & Notes cards (those switched on) each have a + that opens the matching screen; Remember this? has none.' },
      { id: 'deck-nailed-coin', label: 'Your Goals has a "QG" button just left of its +, only while Tokens & Rewards is on; turn Tokens & Rewards off in Settings and the QG button goes (the + stays)' },
      { id: 'deck-nailed-list', label: 'Tap the QG button: the Nailed it! pop-up lists only your active Goals that earn tokens (not Achieved ones, not ones with Earn tokens off)' },
      { id: 'deck-nailed-tap', label: 'Tap a Goal in Nailed it!: its row turns green with "+1 added", the "You have N tokens" line and the My Rewards balance go up by 1, and no new Tickle appears in Tickle Stash; tap it again for another token' },
      { id: 'deck-nailed-empty', label: 'With no Goal earning tokens, Nailed it! says so and "Open Your Goals" closes it and opens Your Goals' },
      { id: 'goal-nailed-count', label: 'A Goal\'s own screen lists each Nailed it! tap as a dusk "Nailed it!" post with a QG mark, date and time, mixed in date order with its Tickles; it has no menu and can\'t be tapped' },
      { id: 'goal-nailed-weekly-target', label: 'A Nailed it! tap fills the weekly target circle (Home and the Goal screen); the "N Tickles" number does not change' },
      { id: 'goal-delete-keeps-tokens', label: 'Delete a Goal you have tapped in Nailed it!: the confirm mentions its Nailed it! count, and your token balance stays the same afterwards' },
      { id: 'deck-swipe-back', label: 'Home deck: swipe the front card off to the left, and to the right: either way the next card comes forward. Then swipe the opposite way straight after: the card you just sent away slides back in on top, from the side it left by. The arrows and dots still go either way' },
    ],
  },
  {
    title: 'Nudges & Notes',
    items: [
      { id: 'rnrs-popup-open', label: "Tap a tile on Home's Nudges & Notes card: today's pop-up opens (Close, Back and the dimmed area all close it)" },
      { id: 'rnrs-popup-empty', label: "Move the last of today's tiles to another day: the pop-up shows the dashed placeholder and Add a tile" },
      { id: 'rnrs-open-page', label: 'Tap the tick-circle button in the bottom bar, and Open Nudges & Notes in the pop-up: the page opens with the button shown as selected' },
      { id: 'rnrs-add-idea', label: 'Add an idea tile to Morning, Afternoon and Evening' },
      { id: 'rnrs-make-tile', label: 'Make a new tile (try the 80-character limit) and see it in My tiles' },
      { id: 'rnrs-rename-delete', label: 'Rename one of your tiles, then delete it; a day it was already on keeps it' },
      { id: 'rnrs-done-undo', label: 'Mark a tile Done (tick, softer pill), then tap Done again to undo' },
      { id: 'rnrs-skip-undo', label: 'Skip a tile (faded, Skipped), then Undo' },
      { id: 'rnrs-move-slot', label: 'Move to another part of the same day' },
      { id: 'rnrs-move-day', label: 'Move to → Another day…, pick a day in the month grid, then find the tile on that day' },
      { id: 'rnrs-day-switcher', label: 'Use the previous/next day arrows and Back to today' },
      { id: 'rnrs-pick-date', label: 'On the Nudges & Notes page, tap the calendar button, pick a date next month, and add a tile there; then use Back to today' },
      { id: 'rnrs-calendar', label: 'Mark a tile Done, then open the Calendar: that day shows a small tick and a Nudges & Notes section listing it.' },
      { id: 'rnrs-weekly-summary', label: 'Your Week shows "Nudges & Notes" only once something is Done this week' },
      { id: 'rnrs-talkback', label: 'TalkBack: tile actions (Done, Move to Morning/Afternoon/Evening, Skip) work' },
      { id: 'rnrs-large-font', label: 'Check the pop-up, the page and the Home top bar at the largest font size' },
    ],
  },
  {
    title: 'Tickle Pics',
    items: [
      { id: 'pics-view-board', label: 'View the Pin Board' },
      { id: 'polaroids-card-default-off', label: 'Home: the Polaroids sent card is not in the deck at first; switch it on in Settings, Look and feel, Home cards (Polaroids sent) and it appears as the last card' },
      { id: 'polaroids-card-grid', label: 'Polaroids sent card, with 3 or more Polaroids sent from Tickle Pics on this phone: the latest (newest first, up to 10) show two across, left to right then down; an odd last one sits on the left' },
      { id: 'polaroids-card-scroll', label: 'Polaroids sent card: drag up and down on it and the Polaroids scroll; swipe sideways on it and the deck still changes card' },
      { id: 'polaroids-card-enlarge', label: 'Polaroids sent card: tap a Polaroid and it opens larger with its caption and the DayTickles App footer, view only; tap outside, Close or Back closes it' },
      { id: 'polaroids-card-plus', label: 'Polaroids sent card: the + opens Tickle Pics; send a Polaroid there and it shows first on the card when you come back to Home' },
      { id: 'polaroids-card-empty', label: 'Polaroids sent card with nothing sent from Tickle Pics on this phone: it says "Polaroids you send from Tickle Pics show up here." and Send a Polaroid opens Tickle Pics' },
    ],
  },
  {
    title: 'Pick your cards',
    items: [
      { id: 'pick-cards-ghost', label: 'New account (after the username): Home shows the dashed Pick your cards card in the deck\'s place, with two dashed cards behind it; no dots, no swipe, no +; the guide and quick-start card show as before' },
      { id: 'pick-cards-sheet', label: 'Tap Pick your cards: the sheet slides up with all 8 cards, every switch off, each with a coloured stripe that is faint when off; tapping the dimmed area or Back closes it without saving' },
      { id: 'pick-cards-button', label: 'In the sheet, the button says "Done, no cards", then "Done, show 1 card", then "Done, show 2 cards" and so on as you switch cards on; on a small phone the list scrolls and the button stays in view' },
      { id: 'pick-cards-some', label: 'Done with some on: the sheet closes and Home shows exactly those cards, in the usual deck order; Settings, Home cards matches' },
      { id: 'pick-cards-none', label: 'Done with none on: Home shows the dashed "No cards on Home" box; its Pick your cards button opens the same sheet' },
      { id: 'pick-cards-close', label: 'New account: close the app before picking and reopen it: the Pick your cards card is still there; Settings, Home cards shows every switch off' },
      { id: 'pick-cards-offline', label: 'Sheet with airplane mode on: Done shows "Couldn\'t save that. Please try again." above the button and the sheet stays open' },
      { id: 'pick-cards-existing', label: 'Existing account: Home looks exactly as before, never shows the Pick your cards card, and doesn\'t flash it while loading' },
    ],
  },
  {
    title: 'Your trackers',
    items: [
      { id: 'trackers-default-off', label: 'Home: the Your trackers card is not in the deck at first; switch it on in Settings, Look and feel, Home cards and it appears as the last card. While it is on, the line under the switch explains it starts empty and only you can see it' },
      { id: 'trackers-off-note', label: 'Switch Your trackers off: the Off line under it says nothing is deleted; switch it back on and your trackers and ratings are still there' },
      { id: 'trackers-add-each-method', label: 'Add a tracker with Words, one with A number from 0 to 10, and one with An amount (with and without a unit); the name field shows no examples, the preview matches the choice, and after saving the Your trackers page opens' },
      { id: 'trackers-rate-clear', label: 'Your trackers page: rate each one and clear it again (tap the chosen word or number again; Clear for an amount; type an amount by tapping the number); the 7-day trail and the Home card row show the change' },
      { id: 'trackers-limit', label: 'Add a 6th tracker: it says "You can keep up to 5 trackers." and nothing is added' },
      { id: 'trackers-home-card', label: 'Home Your trackers card: one row per tracker with today\'s rating (or Not rated); a row opens Your trackers; the + opens New tracker; with none it says "Track anything you choose." with an Add a tracker row' },
      { id: 'trackers-private', label: 'Sign in with a second account: it sees none of the first account\'s trackers' },
      { id: 'trackers-detail-open', label: 'Your trackers page: tap a tracker\'s name (with the small arrow): its own screen opens with the name, how it is rated, and the line saying that can\'t be changed' },
      { id: 'trackers-detail-rename', label: 'Tracker screen: rename it (Save is greyed out until the name changes); go back and the new name shows on Your trackers and on the Home card' },
      { id: 'trackers-detail-range', label: 'Tracker screen: switch between 7 days and 30 days; the bars fit, and Days rated, Highest and Average (Most often for Words) match your ratings; with nothing rated it says "Nothing rated in this time yet."' },
      { id: 'trackers-detail-delete', label: 'Tracker screen: Delete tracker and its ratings asks first (Cancel keeps it); Delete returns to Your trackers without it, one Back from there leaves Your trackers, and the Home card no longer shows it' },
      { id: 'trackers-detail-offline', label: 'Tracker screen with airplane mode on: rename and delete each say they couldn\'t do it, and nothing changes' },
      { id: 'trackers-offline', label: 'Turn on airplane mode: the Your trackers page and card say they could not load; a rating tap goes back and shows "Couldn\'t save that"' },
      { id: 'trackers-plural-suggest', label: 'New tracker, An amount: a More than one box shows under Unit (no example text in either). Type cup: it fills in cups. Change it to glass: it becomes glasses. Type ml: More than one stays empty' },
      { id: 'trackers-plural-own-edit', label: 'New tracker, An amount: type cup, then change More than one by hand (or clear it); now change the Unit: your own More than one stays as you left it' },
      { id: 'trackers-unit-lowercase', label: 'New tracker and the tracker screen: the Unit and More than one boxes start in lower case (the keyboard doesn\'t start with a capital); you can still type capitals' },
      { id: 'trackers-plural-preview', label: 'New tracker, An amount with cup / cups: the preview shows 0 cups, then 1 cup with +, then 2 cups; type 0.5: 0.5 cups' },
      { id: 'trackers-plural-shown', label: 'An amount tracker with cup / cups: rate 1 and Your trackers and the Home card show 1 cup; rate 2 and both show 2 cups; TalkBack reads 1 cup / 2 cups on the amount and in the 7-day trail' },
      { id: 'trackers-plural-stats', label: 'Tracker screen for cup / cups: Highest and Average say 1 cup only when the number shown is exactly 1, and cups for anything else (for example 1.5 cups)' },
      { id: 'trackers-unit-edit', label: 'Tracker screen of an amount tracker: a Unit section with Unit and More than one; Save is greyed out until something changes; change them and Save: the line under the name, Highest and Average, Your trackers and the Home card use the new unit, and the ratings stay. A Words or 0 to 10 tracker has no Unit section' },
      { id: 'trackers-unit-edit-offline', label: 'Tracker screen with airplane mode on: saving the Unit says it couldn\'t change it, and nothing changes' },
      { id: 'trackers-unit-old', label: 'A tracker made before this change (no More than one saved) shows its unit exactly as typed for every amount, as before' },
    ],
  },
  {
    title: 'Day Dots',
    items: [
      { id: 'daydots-answer-today', label: "Answer today's Day Dot" },
      { id: 'day-dot-change', label: 'On the Home How bright is your day? card, dot your day at any time of day, then change it later the same day; a skipped day can still be dotted' },
      { id: 'day-dots-card', label: 'Home How bright is your day? card: tap the dot to step up a size (after the biggest it goes back to the smallest) and see it change; tap Skip; change it later in the day; the 4 past days show as beads; the card colour changes with each Home colour set; the four sizes fade from the biggest (brightest) to the smallest (dimmest), on the big dot and the trail; at large text Skip may move under the title: nothing clipped, the dot and the five beads still fit (also at 360dp wide).' },
      { id: 'daydots-calendar-history', label: 'Check Day Dot history on the Calendar' },
    ],
  },
  {
    title: 'Daily Vibe targets',
    items: [
      { id: 'vibe-target-set-daily', label: 'Set a daily target for a Vibe (Settings → Your week → Vibe Targets, + / − stepper)' },
      { id: 'vibe-target-daily-bulb', label: "Hit it today and see that Vibe's daily lightbulb light up on its Home card" },
      { id: 'vibe-target-weekly', label: 'Set a weekly target too (Settings → Your week → Vibe Targets) and see its weekly lightbulb light up once hit' },
    ],
  },
  {
    title: 'Tokens & Rewards',
    items: [
      { id: 'tokens-earn-on-tag', label: 'Turn "Earn tokens" on for a Goal (Manage Goals). Tag an entry to it → the balance on the My Rewards card goes up by 1 (switch tabs if it hasn\'t updated)' },
      { id: 'tokens-retag-same-goal', label: 'Re-tag the same entry to the same Goal → confirm no extra token' },
      { id: 'tokens-untag-retag', label: "Remove the tag, then re-tag → confirm no extra token, and confirm removing the tag doesn't take the token away" },
      { id: 'tokens-non-earning-goal', label: 'Tag an entry to a Goal with "Earn tokens" off → confirm no token' },
      { id: 'tokens-add-reward', label: 'Add a reward (name, cost, optional icon) on the Reward List' },
      { id: 'tokens-header-circle', label: "Check the balance on the My Rewards card on Home: each reward's circle is hollow when you can't afford it, filled with a tick once you can; tap a reward to confirm it opens the Reward List" },
      { id: 'tokens-redeem', label: "Redeem a reward you can afford → balance drops, reward stays on the list; confirm Redeem is disabled when you can't afford it" },
      { id: 'tokens-delete-reward', label: 'Delete a reward' },
      { id: 'tokens-master-toggle', label: 'Turn Tokens & Rewards off in Settings → the My Rewards card, the coin on Goal rows and the QG button on Your Goals disappear, and Manage Reward List is disabled; turn it back on → they return, with the same balance on the My Rewards card' },
    ],
  },
  {
    title: 'Settings & account',
    items: [
      { id: 'settings-accent-colour', label: 'Change accent colour' },
      { id: 'settings-home-cards-off', label: 'Settings, Look and feel, Home cards: switch a card off and back on; it leaves Home and comes back, and its feature still works from its own screen' },
      { id: 'settings-home-cards-front', label: 'With a card in front on Home, switch it off in Settings and go back to Home: the deck shows the card next to it, not always the first one' },
      { id: 'settings-home-cards-all-off', label: 'Switch every Home card off: Home shows the dashed "No cards on Home" box, and its Pick your cards button opens the sheet' },
      { id: 'settings-home-cards-notes', label: 'Switch Your Goals off, then How bright is your day? off: each shows its own Off line under it, and it goes when switched back on' },
      { id: 'settings-sign-out-in', label: 'Sign out and sign back in' },
      { id: 'settings-awareness-cue', label: 'Receive and tap an Awareness Cue reminder' },
    ],
  },
];

const TOTAL_ITEMS = SECTIONS.reduce((n, s) => n + s.items.length, 0);

export default function TestingChecklist() {
  // { [itemId]: { checked: boolean, note: string } }
  const [state, setState] = useState({});
  // Item ids whose note field the tester has opened this visit -- a
  // field with a saved note stays open regardless.
  const [openNotes, setOpenNotes] = useState(new Set());
  const loadedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => {
        loadedRef.current = true;
      });
  }, []);

  // Persist after every change, but never before the initial load has
  // landed -- otherwise the empty initial state could overwrite saved ticks.
  useEffect(() => {
    if (!loadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  function toggleChecked(id) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], checked: !prev[id]?.checked } }));
  }

  function setNote(id, note) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], note } }));
    // Keep the field open while editing, so deleting a saved note down to
    // empty doesn't make it vanish mid-keystroke.
    openNote(id);
  }

  function openNote(id) {
    setOpenNotes((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  const checkedCount = SECTIONS.reduce(
    (n, s) => n + s.items.filter((item) => state[item.id]?.checked).length,
    0
  );

  return (
    <WallpaperBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Testing Checklist</Text>
        <Text style={styles.explainerText}>
          Temporary — removed before public release. Ticks and notes are saved on this device only,
          as a scratchpad before you report back.
        </Text>
        <Text style={styles.progressText}>
          {checkedCount} of {TOTAL_ITEMS} checked
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.label}>{section.title}</Text>
            {section.items.map((item) => {
              const itemState = state[item.id] || {};
              const note = itemState.note || '';
              const noteOpen = !!note || openNotes.has(item.id);
              return (
                <View key={item.id} style={styles.itemBlock}>
                  <View style={styles.itemRow}>
                    <TouchableOpacity
                      style={styles.checkTouch}
                      onPress={() => toggleChecked(item.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={itemState.checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={itemState.checked ? C.rust : C.subtext}
                      />
                      <Text style={[styles.itemLabel, itemState.checked && styles.itemLabelChecked]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                    {!noteOpen && (
                      <TouchableOpacity
                        onPress={() => openNote(item.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="create-outline" size={18} color={C.subtext} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {noteOpen && (
                    <TextInput
                      style={styles.noteInput}
                      value={note}
                      onChangeText={(text) => setNote(item.id, text)}
                      placeholder="Note (optional)"
                      placeholderTextColor={C.faint}
                      // Focus straight away when opened from the note icon
                      // (empty), but not when a saved note mounts on load.
                      autoFocus={!note}
                      multiline
                    />
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 8 },
  explainerText: { fontSize: 12, color: C.subtext, lineHeight: 16 },
  progressText: { fontSize: 13, fontWeight: '600', color: C.text, marginTop: 10, marginBottom: 16 },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16,
    backgroundColor: withAlpha(C.subtext, 0.1), borderColor: C.border,
  },
  label: { fontSize: 14, color: C.subtext, marginBottom: 10 },
  itemBlock: { paddingVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  checkTouch: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  itemLabel: { flex: 1, fontSize: 15, color: C.text, marginLeft: 10 },
  itemLabelChecked: { color: C.subtext },
  noteInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, marginLeft: 32,
    fontSize: 14, backgroundColor: C.card, color: C.text,
  },
});
