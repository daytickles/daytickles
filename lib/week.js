// Monday–Sunday week boundary — single source of truth for "current
// week," reused by Home's weekly stats today and the Weekly Summary
// feature later. Computed in UTC to match entry_date's UTC-based day
// boundary (see dateStr in home.js / entry_date in create.js).
function mondayOf(date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  utcDate.setUTCDate(utcDate.getUTCDate() - diffToMonday);
  return utcDate;
}

// 'YYYY-MM-DD' for the Monday that starts the current week.
export function currentWeekStartDate() {
  return mondayOf(new Date()).toISOString().slice(0, 10);
}

// ISO timestamp for 00:00:00 UTC that Monday — for server-side
// timestamptz filtering (e.g. likes.created_at).
export function currentWeekStartISO() {
  return `${currentWeekStartDate()}T00:00:00.000Z`;
}

// True when a 'YYYY-MM-DD' entry_date falls within the current week.
export function isThisWeek(entryDate) {
  return entryDate >= currentWeekStartDate();
}
