// supabase/functions/notify-on-like/index.ts
//
// Fired by a Database Webhook on `likes` INSERT. Looks up the liked
// entry's owner, and if they have push notifications enabled and a
// registered device, sends them an Expo push notification. The in-app
// notification list is separate and unaffected by this — it keeps
// logging every like regardless.
//
// This project has no linked Supabase CLI (same as the migrations,
// which are applied by hand through the SQL Editor) — deploy this by
// pasting it into the dashboard's Edge Functions editor.
//
// "Verify JWT" must be turned OFF for this function: Database Webhooks
// don't send a user JWT, so built-in verification would reject every
// call. Authentication instead comes from the shared-secret check
// below — the LIKE_WEBHOOK_SECRET function secret must match the
// Authorization header configured on the webhook itself.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get('LIKE_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization');

  // Reject before touching the payload or making any DB call — an
  // unrecognized caller gets nothing but a 401.
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Guards against the webhook ever being pointed at the wrong
  // table/event by a future dashboard misconfiguration.
  if (payload?.type !== 'INSERT' || payload?.table !== 'likes') {
    return new Response('OK', { status: 200 });
  }

  const like = payload.record;
  if (!like?.entry_id || !like?.user_id) {
    return new Response('Bad Request', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Service-role client — bypasses RLS so the owner lookup works
  // regardless of the entry's visibility, rather than depending on a
  // webhook call (which carries no user JWT) happening to satisfy the
  // "public or owner" select policy on tickle_entries.
  const { data: entry } = await supabase
    .from('tickle_entries')
    .select('user_id')
    .eq('id', like.entry_id)
    .single();

  if (!entry) {
    return new Response('OK', { status: 200 });
  }

  const { data: owner } = await supabase
    .from('profiles')
    .select('notify_on_likes, expo_push_token')
    .eq('id', entry.user_id)
    .single();

  if (!owner?.notify_on_likes || !owner?.expo_push_token) {
    return new Response('OK', { status: 200 });
  }

  const { data: liker } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', like.user_id)
    .single();

  const likerName = liker?.username || 'Someone';

  try {
    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: owner.expo_push_token,
        sound: 'default',
        title: 'DayTickles',
        body: `${likerName} liked your tickle!`,
        // Must match ANDROID_CHANNEL_ID in lib/reminders.js — without
        // this, Android falls back to the manifest's default channel
        // (also 'default'), but being explicit here means the payload
        // no longer depends on that fallback matching by coincidence.
        channelId: 'default',
      }),
    });
    // TEMP DEBUG — remove once the DeviceNotRegistered/ticket-status
    // question is answered. Expo's push API returns 200 even when a
    // notification is rejected; the real result is in this body's
    // per-notification "ticket" (status: 'ok' | 'error', with a
    // details.error code like DeviceNotRegistered when applicable).
    const expoBody = await expoResponse.text();
    console.log('Expo push response:', expoResponse.status, expoBody);
  } catch (err) {
    // Delivery is best-effort — the like itself already succeeded and
    // is already in the in-app notification list regardless of whether
    // the push send below works.
    console.error('Expo push send failed:', err);
  }

  return new Response('OK', { status: 200 });
});
