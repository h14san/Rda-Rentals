// send-push: delivers one notification row to its owner's devices through the
// Expo Push Service.
//
// Called by the database (notify_user() via pg_net), not by the app. It runs
// without JWT verification because Postgres has no user token to send, so it
// must be safe for anyone on the internet to call. It is, for two reasons:
//
//   1. The request names a notification id and nothing else. The words, the
//      recipient and the tokens are all read here from the database, so a
//      caller cannot choose what is sent or to whom.
//   2. A row is claimed by setting pushed_at where it is null. A second call
//      for the same id claims nothing and sends nothing, so the function cannot
//      be used to replay a notification.
//
// It holds the service role key (injected by the platform), which is why none
// of this can live in the app.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Must match the channel the app creates in src/lib/push.ts. Android drops a
// notification addressed to a channel the device does not have.
const ANDROID_CHANNEL = 'default';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  let id: unknown;
  try {
    id = (await req.json())?.notification_id;
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }
  if (typeof id !== 'string' || !UUID.test(id)) {
    return json({ error: 'notification_id must be a uuid.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error('send-push is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Push is misconfigured.' }, 503);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Claim the row. Zero rows back means it does not exist, was already sent,
  // or was decided against (notify_user sets pushed_at itself in that case).
  const claim = await db
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', id)
    .is('pushed_at', null)
    .select('id, user_id, kind, title, body, payload')
    .maybeSingle();

  if (claim.error) {
    console.error('send-push claim failed', claim.error.message);
    return json({ error: 'Push is unavailable right now.' }, 502);
  }
  if (!claim.data) return json({ sent: 0, reason: 'nothing to send' });
  const n = claim.data;

  const tokens = await db.from('push_tokens').select('token').eq('user_id', n.user_id);
  if (tokens.error) {
    console.error('send-push token lookup failed', tokens.error.message);
    return json({ error: 'Push is unavailable right now.' }, 502);
  }
  if (tokens.data.length === 0) return json({ sent: 0, reason: 'no devices' });

  const messages = tokens.data.map(({ token }) => ({
    to: token,
    title: n.title,
    body: n.body ?? undefined,
    // What the app needs to open the right screen on a tap. Ids only.
    data: { kind: n.kind, notification_id: n.id, ...(n.payload ?? {}) },
    sound: 'default',
    channelId: ANDROID_CHANNEL,
    priority: 'high',
  }));

  let tickets: { status: string; details?: { error?: string } }[] = [];
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      // A user has a handful of devices, far under Expo's 100-per-request cap.
      body: JSON.stringify(messages),
    });
    const parsed = await res.json();
    if (!res.ok || !Array.isArray(parsed?.data)) {
      console.error('send-push: Expo refused the request', res.status, JSON.stringify(parsed));
      return json({ error: 'The push service refused the request.' }, 502);
    }
    tickets = parsed.data;
  } catch (e) {
    console.error('send-push: could not reach Expo', e instanceof Error ? e.message : e);
    return json({ error: 'The push service could not be reached.' }, 502);
  }

  // A token Expo no longer knows is an uninstalled app or a reset phone. Drop
  // it, so the next notification does not pay for it again.
  const dead = tickets
    .map((t, i) => (t.details?.error === 'DeviceNotRegistered' ? messages[i].to : null))
    .filter((t): t is string => t !== null);
  if (dead.length > 0) {
    const removed = await db.from('push_tokens').delete().in('token', dead);
    if (removed.error) console.error('send-push: could not drop dead tokens', removed.error.message);
  }

  return json({
    sent: tickets.filter((t) => t.status === 'ok').length,
    dropped: dead.length,
  });
});
