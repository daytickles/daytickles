// supabase/functions/delete-account/index.ts
//
// Deletes the calling user's own account and everything in it. This
// exists because supabase-js's client SDK has no self-service delete —
// confirmed directly against the installed SDK's own type definitions:
// deleteUser() lives only on GoTrueAdminApi (service-role only), not on
// GoTrueClient (the regular anon-key + user-session client the app
// uses everywhere else). So this always has to go through a
// service-role Edge Function.
//
// Unlike notify-on-like, leave "Verify JWT" ON (the Supabase-managed
// default) when deploying this — that's what's opposite here.
// notify-on-like turns it OFF because it's called by a Database
// Webhook with no user JWT at all, and authenticates instead via a
// shared secret (LIKE_WEBHOOK_SECRET). This function IS called by a
// real signed-in user, so identity comes from their own session token,
// re-validated via auth.getUser() below (not decoded locally, and
// never trusted from anything the client sends in the request body) —
// that's what guarantees a user can only ever delete themselves.
//
// The deletion itself is a single auth.admin.deleteUser() call. Per
// the FK audit done before writing this (every table hanging off
// profiles.id, and transitively off tickle_entries.id, across all 14
// user-data tables) is ON DELETE CASCADE with exactly one exception:
// notifications.actor_id is ON DELETE SET NULL — correctly, since that
// anonymizes a notification that belongs to a DIFFERENT user's
// notification list rather than deleting content that isn't this
// user's to delete. No explicit per-table deletes are needed.
//
// Deploy the same way as notify-on-like (this project has no linked
// Supabase CLI): paste into the dashboard's Edge Functions editor.
// No custom secret to configure — SUPABASE_URL, SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY are all auto-provided in every Edge
// Function's environment, same as notify-on-like already relies on for
// the latter two.

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

  // Scoped to the caller's own token — used only to find out who's
  // actually asking, never to perform the deletion itself.
  const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Service-role client — the only client capable of deleting an
  // auth.users row at all (see the module comment above).
  const adminClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account failed:', deleteError);
    return new Response('Internal Error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
