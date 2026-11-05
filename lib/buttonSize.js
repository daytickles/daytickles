// lib/buttonSize.js
//
// App-wide button sizes, matching Home's New Tickle / Quick Tickle pills.
//
// PILL (the default): 30dp tall as a minHeight (a large font size grows
// it, never clips it), fully rounded, 14/600 label, 16dp side padding,
// and BUTTON_HIT_SLOP above and below so the tap area is 44dp tall.
//
// MAIN: the main action on a screen (Sign in, Save, Continue, Got it,
// Next): 40dp minHeight, 16/600 label, MAIN_BUTTON_HIT_SLOP for 44dp.
//
// Alert and confirm buttons, menu and picker rows, icon-only buttons and
// tags keep their own sizes.

export const BUTTON_HEIGHT = 30;
export const BUTTON_TAP_HEIGHT = 44;
export const BUTTON_HIT_SLOP = { top: 7, bottom: 7 };
export const BUTTON_RADIUS = 15;
export const BUTTON_FONT_SIZE = 14;
export const BUTTON_PADDING_X = 16;

export const MAIN_BUTTON_HEIGHT = 40;
export const MAIN_BUTTON_RADIUS = 20;
export const MAIN_BUTTON_FONT_SIZE = 16;
export const MAIN_BUTTON_HIT_SLOP = { top: 2, bottom: 2 };
