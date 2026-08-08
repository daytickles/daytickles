// Day/week boundary — single source of truth, reused by Home's
// streak/pinned-window/weekly stats, entry_date (create.js), and the
// Weekly Summary feature later. Computed in the DEVICE'S LOCAL
// calendar, not UTC — "Monday" (and "today") should match what the
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

function mondayOf(date) {
  const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localMidnight.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  localMidnight.setDate(localMidnight.getDate() - diffToMonday);
  return localMidnight;
}

// 'YYYY-MM-DD' for the Monday that starts the current week (local).
export function currentWeekStartDate() {
  return toDateString(mondayOf(new Date()));
}

// The real UTC instant corresponding to local midnight on that Monday —
// for server-side timestamptz filtering (e.g. likes.created_at).
export function currentWeekStartISO() {
  return mondayOf(new Date()).toISOString();
}

// True when a 'YYYY-MM-DD' entry_date falls within the current week.
export function isThisWeek(entryDate) {
  return entryDate >= currentWeekStartDate();
}
