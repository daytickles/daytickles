// supabase/functions/awareness-cue-dispatch/index.ts
//
// Triggered on a schedule by an external caller (.github/workflows/
// awareness-cue-dispatch.yml, not Supabase Cron -- see that workflow's
// header comment for why). Two jobs merged into one tick, deliberately
// (see the concept-spec audit, 2026-08-22): the "does anyone's window
// need a schedule generated right now" check is inherently a per-user,
// per-timezone, frequent check, not a once-daily batch, so there was
// no honest way to keep generation and dispatch as separate cron jobs
// without one of them becoming timezone-incorrect.
//
// This is the *fallback* path only -- see app/(tabs)/home.js for the
// primary, free, client-side path that handles the normal case (app
// opened before the user's window starts). A user only ever gets rows
// here if that path didn't already claim their day first.
//
// This project has no linked Supabase CLI (same as the migrations,
// which are applied by hand through the SQL Editor) -- deploy this by
// pasting it into the dashboard's Edge Functions editor, same as
// notify-on-like.
//
// "Verify JWT" must be turned OFF for this function: the GitHub
// Actions caller has no user JWT to send. Authentication instead comes
// from the shared-secret check below -- the AWARENESS_CUE_CRON_SECRET
// function secret must match the Authorization header the workflow
// sends.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Must match lib/reminders.js's own constants -- duplicated here
// because this Deno runtime can't import that React Native file.
// Keep these two files in sync by hand if either changes.
const AWARENESS_CUE_SOUND_CHANNEL_ID = 'awareness-cue-sound';
const AWARENESS_CUE_VIBRATE_CHANNEL_ID = 'awareness-cue-vibrate-v2';
const AWARENESS_CUE_SOUND = 'psst.wav';
const LOOSE_MODE_MIN_COUNT = 2;
const LOOSE_MODE_MAX_COUNT = 5;
const MAX_SLOTS = 10;

// A cue more than this many hours late has missed its own point --
// Awareness Cue's whole premise is "notice something good happening
// right now," not a delayed, out-of-context buzz. Rows older than this
// are marked delivered (skipped, not sent) rather than fired late.
// Chosen to comfortably absorb a single missed tick or short outage
// (at a 5-15 min cadence, that's tens of ticks of headroom) without
// ever sending something that reads as random by the time it arrives.
const STALE_CUTOFF_HOURS = 2;

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get('AWARENESS_CUE_CRON_SECRET');
  const authHeader = req.headers.get('Authorization');

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const generated = await generateDueSchedules(supabase);
  const sent = await sendDuePushes(supabase);

  return new Response(JSON.stringify({ generated, sent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// Phase 1: claim any users whose local window just opened and who
// haven't been handled today by either path, then compute and insert
// their day's random cue times. Mirrors lib/reminders.js's
// regenerateAwarenessCueSchedule, but producing DB rows (real UTC
// instants) instead of on-device scheduleNotificationAsync calls.
async function generateDueSchedules(supabase) {
  const { data: claimed, error } = await supabase.rpc('claim_due_awareness_cue_users');
  if (error) {
    console.error('claim_due_awareness_cue_users failed:', error);
    return 0;
  }
  if (!claimed?.length) return 0;

  const rows = [];
  for (const user of claimed) {
    const nowUtc = new Date(user.now_utc);
    const windowEndUtc = new Date(user.window_end_utc);
    if (nowUtc >= windowEndUtc) continue;

    const targetCount =
      user.frequency_mode === 'exact'
        ? user.count || 1
        : LOOSE_MODE_MIN_COUNT +
          Math.floor(Math.random() * (LOOSE_MODE_MAX_COUNT - LOOSE_MODE_MIN_COUNT + 1));
    const slotCount = Math.min(targetCount, MAX_SLOTS);

    const spanMs = windowEndUtc.getTime() - nowUtc.getTime();
    for (let i = 0; i < slotCount; i++) {
      rows.push({
        user_id: user.user_id,
        cue_type: user.cue_type,
        for_date: user.for_date,
        scheduled_at: new Date(nowUtc.getTime() + Math.random() * spanMs).toISOString(),
      });
    }
  }

  if (!rows.length) return 0;

  const { error: insertError } = await supabase.from('awareness_cue_scheduled_pushes').insert(rows);
  if (insertError) {
    console.error('Failed to insert generated schedule rows:', insertError);
    return 0;
  }
  return rows.length;
}

// Phase 2: send every due, undelivered row -- skipping (marking
// delivered without sending) anything too stale to still make sense,
// or belonging to a user who no longer has a usable push token.
async function sendDuePushes(supabase) {
  const { data: due, error } = await supabase
    .from('awareness_cue_scheduled_pushes')
    .select('id, user_id, cue_type, scheduled_at, profiles(expo_push_token)')
    .is('delivered_at', null)
    .lte('scheduled_at', new Date().toISOString());

  if (error) {
    console.error('Failed to query due awareness_cue_scheduled_pushes:', error);
    return 0;
  }
  if (!due?.length) return 0;

  const staleCutoffMs = STALE_CUTOFF_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  let sentCount = 0;

  for (const row of due) {
    const isStale = now - new Date(row.scheduled_at).getTime() > staleCutoffMs;
    const token = row.profiles?.expo_push_token;

    if (!isStale && token) {
      try {
        const channelId =
          row.cue_type === 'sound' ? AWARENESS_CUE_SOUND_CHANNEL_ID : AWARENESS_CUE_VIBRATE_CHANNEL_ID;
        const expoResponse = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            to: token,
            title: 'DayTickles',
            ...(row.cue_type === 'sound' ? { sound: AWARENESS_CUE_SOUND } : {}),
            channelId,
          }),
        });
        const expoBody = await expoResponse.text();
        console.log('Awareness Cue push response:', row.id, expoResponse.status, expoBody);
        sentCount++;
      } catch (err) {
        // Best-effort, same philosophy as notify-on-like -- still mark
        // delivered below so a transient failure doesn't retry forever.
        console.error('Awareness Cue push send failed:', row.id, err);
      }
    } else {
      console.log(
        isStale ? 'Skipping stale awareness cue row:' : 'Skipping awareness cue row, no push token:',
        row.id
      );
    }

    await supabase
      .from('awareness_cue_scheduled_pushes')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', row.id);
  }

  return sentCount;
}
