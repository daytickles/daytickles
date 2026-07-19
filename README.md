# DayTickles — Expo prototype (rebuilt clean)

## Fixes in this version
- **New tickles showing up last instead of first, in both the archive and
  the feed**: entries were being sorted by their day-level `date` field
  only (e.g. `"2026-07-15"`), not by the precise `createdAt` timestamp each
  entry already stores. Any two entries made on the same day compared as
  "equal" under that sort, and the comparator handled ties incorrectly, so
  new same-day entries didn't reliably land at the top. Fixed by sorting on
  `createdAt` instead — both Home and Feed pull from the same sorted list,
  so one fix covers both.
- **Feed / Create / Notifications / Settings still looked cramped at the top,
  even after the safe-area fix**: this turned out to be a separate bug, not
  a safe-area one. Those four screens all use a shared `TopBar` component
  that referenced a style called `topBar` — but that style was never
  actually defined in the stylesheet. React Native silently ignores
  undefined styles rather than erroring, so `TopBar` was rendering with no
  layout at all (no row alignment, no spacing below it), which looked
  identical to the safe-area overlap even though the safe-area fix itself
  was working correctly. Home was the only screen unaffected, since it uses
  its own separately-defined header style rather than `TopBar`. Added the
  missing style.
- **Header and bottom nav overlapping the phone's own UI**: the previous fix
  (a manual `StatusBar.currentHeight` patch) only handled the top on Android
  and didn't touch the bottom at all — so the app's bottom nav could still
  sit under your phone's gesture bar/nav buttons. Modern Android renders
  edge-to-edge by default, so a manual guess isn't reliable. Fixed properly
  with `react-native-safe-area-context`, which reads the actual device
  insets (notch, status bar, gesture bar, home indicator) on both iOS and
  Android and pads the app content accordingly, top and bottom.
- **Unreadable bottom nav icons**: replaced raw Unicode characters with
  `@expo/vector-icons` (Ionicons), which ships bundled with `expo` — no new
  dependency needed for that part.

**New dependency this version**: `react-native-safe-area-context`. Install
it with `npx expo install` (not plain `npm install`) so it gets the exact
version matched to your SDK — see step 2 below.

This is a fresh rebuild, fixing the issues from the first attempt:
- `expo-status-bar` is removed entirely (it caused the plugin errors) — the
  status bar now uses React Native's own built-in `StatusBar`, which needs
  no config plugin at all.
- `package.json` only pins the `expo` package itself. Everything else (React,
  React Native, AsyncStorage) gets installed in step 2 below using Expo's own
  installer, which automatically picks versions that are actually correct for
  your SDK — this avoids the version-mismatch chain from before.

## Setup — follow these steps in order

**1. Install the base dependencies:**
```
npm install
```

**2. Let Expo install the exact-right versions of React, React Native,
AsyncStorage, and safe-area-context for SDK 54** (don't `npm install` these
manually — this command is what avoids the version mismatches from before):
```
npx expo install react react-native @react-native-async-storage/async-storage react-native-safe-area-context
```

**3. Start the project, with the cache cleared:**
```
npx expo start -c
```

**4. Scan the QR code** that appears with your phone:
- iOS: Camera app → tap the notification
- Android: open Expo Go → use its built-in scanner

Your phone and computer must be on the same Wi-Fi network.

## If you still see "Project is incompatible with this version of Expo Go"

This means your phone's Expo Go app and this project's SDK don't match.
Check your Expo Go version: open the app → Profile/Settings tab → it shows
the supported SDK number.
- If it says SDK 54, this project should match — try `npx expo start -c` again.
- If it's shown a different number, go to `https://expo.dev/go` in your
  phone's browser, pick Android + the SDK number your project uses
  (check `package.json` for the `expo` version), and install that build
  directly rather than relying on the Play Store listing, which can lag
  behind newly released SDKs.

## If npm install or expo install throws an error

Delete `node_modules` and `package-lock.json`, then start again from step 1.
This clears out any half-installed packages from a previous attempt.

## What's next
This version only saves data on your phone (AsyncStorage) — nothing is
shared between devices yet. The `daytickles-scaffold.zip` (Node/Express +
Prisma API) is the backend this would eventually connect to.
