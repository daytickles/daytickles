// Day/week boundary — single source of truth, reused by Home's
// streak/pinned-window/weekly stats, entry_date (create.js), and the
// Weekly Summary screen. Computed in the DEVICE'S LOCAL calendar, not
// UTC — "today" (and the start of "this week") should match what the
// clock on the wall says, not what it says in Greenwich.
function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Local 'YYYY-MM-DD' for an arbitrary Date, not just "today" -- e.g.
// converting a stored UTC pinned_at instant (lib/pinBoardDb.js) to the
// local calendar day it actually falls on, reusing the same local-time
// logic as everywhere else in this file rather than a second one.
export function toLocalDateString(date) {
  return toDateString(date);
}

// 'YYYY-MM-DD' for today (or `offsetDays` days before today) in the
// device's local calendar. setDate handles month/year rollover and DST
// transitions correctly on its own.
export function localDateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return toLocalDateString(d);
}

// Matches profiles.week_start_day's own default -- callers without a
// loaded profile yet (or a still-null field on an old row) fall back
// to this rather than crashing on undefined.
export const DEFAULT_WEEK_START_DAY = 1; // Monday

// 0=Sunday..6=Saturday, same convention as Date.getDay() and
// profiles.week_start_day -- no translation layer between the DB, this
// file, and JS's own day numbering.
function weekStartOf(date, weekStartDay = DEFAULT_WEEK_START_DAY) {
  const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localMidnight.getDay();
  const diffToStart = (day - weekStartDay + 7) % 7;
  localMidnight.setDate(localMidnight.getDate() - diffToStart);
  return localMidnight;
}

// 'YYYY-MM-DD' for the day that starts the current week (local), per
// weekStartDay (0=Sunday..6=Saturday, defaults to Monday -- see
// DEFAULT_WEEK_START_DAY).
export function currentWeekStartDate(weekStartDay = DEFAULT_WEEK_START_DAY) {
  return toDateString(weekStartOf(new Date(), weekStartDay));
}

// The real UTC instant corresponding to local midnight on that day --
// for server-side timestamptz filtering (e.g. likes.created_at).
export function currentWeekStartISO(weekStartDay = DEFAULT_WEEK_START_DAY) {
  return weekStartOf(new Date(), weekStartDay).toISOString();
}

// True when a 'YYYY-MM-DD' entry_date falls within the current week.
export function isThisWeek(entryDate, weekStartDay = DEFAULT_WEEK_START_DAY) {
  return entryDate >= currentWeekStartDate(weekStartDay);
}
