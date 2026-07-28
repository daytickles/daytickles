// lib/likeNotify.js
//
// Calls the notify-on-like Edge Function directly, right after a like
// insert succeeds — standing in for the Database Webhook this project's
// Supabase instance turned out not to have provisioned (webhooks
// require the supabase_functions/pg_net schema, which 404s here; see
// supabase/functions/notify-on-like/index.ts for the function itself).
// Every like in this app is created from feed.js's handleToggleLike, so
// calling the function directly from there covers the same ground a
// webhook would have.
//
// Trade-off: this secret ships inside the app bundle, unlike a webhook
// secret which never leaves the server. It's extractable (decompilation,
// network capture) — worth knowing if this ever needs hardening beyond
// what a small social app's abuse risk currently calls for.

const FUNCTION_URL = 'https://nzuvxqrnrknyfijowics.supabase.co/functions/v1/notify-on-like';
const LIKE_WEBHOOK_SECRET = '96e871e250bdab8e740c164cd6c19161a851577483f1d1c4948ed54704dfd2da';

// Matches the JSON shape supabase_functions.http_request() would have
// built automatically for a webhook (type/table/record) — the Edge
// Function itself is unchanged, it just has a new caller.
export async function notifyLikeReceived(entryId, likerId) {
  try {
    await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LIKE_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        type: 'INSERT',
        table: 'likes',
        record: { entry_id: entryId, user_id: likerId },
      }),
    });
  } catch {
    // Best-effort — the like itself already succeeded regardless of
    // whether the push notification fires.
  }
}
