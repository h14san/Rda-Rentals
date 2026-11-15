// send-sms: Supabase Auth's "Send SMS" hook, delivering sign-in codes through
// Pindo (decided 2026-10-30; Pindo is a Rwandan SMS provider).
//
// Supabase Auth calls this instead of Twilio whenever it needs to text a code.
// The app does not change: src/lib/auth.ts already has a phone channel, and
// EXPO_PUBLIC_AUTH_CHANNEL=phone switches to it.
//
// It runs without JWT verification, because Auth is the caller and has no user
// token. What it has instead is a Standard Webhooks signature over the body,
// made with a secret only Auth and this function hold. A request that does not
// carry a valid one is refused before anything is sent, so nobody can use this
// URL to make the project text people.
//
// Secrets (npx supabase secrets set NAME=value):
//   SEND_SMS_HOOK_SECRET  from the Auth hook's settings; looks like "v1,whsec_..."
//   PINDO_API_TOKEN       Pindo dashboard > Security
//   PINDO_SENDER_ID       the sender name registered with Pindo
//
// Deploy: npx supabase functions deploy send-sms --no-verify-jwt
//
// Written from the two providers' documentation and not yet run against either:
// there is no Pindo account. The first real code is the test.

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const PINDO_URL = 'https://api.pindo.io/v1/sms/';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The shape Auth expects for a hook failure. */
function failure(status: number, message: string): Response {
  return json({ error: { http_code: status, message } }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return failure(405, 'POST only.');

  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const token = Deno.env.get('PINDO_API_TOKEN');
  const sender = Deno.env.get('PINDO_SENDER_ID');
  if (!hookSecret || !token || !sender) {
    console.error('send-sms is missing a secret');
    return failure(500, 'SMS sign-in is not configured.');
  }

  // The raw body, exactly as signed. Parsing first and re-serialising would
  // change the bytes and fail every signature.
  const payload = await req.text();

  let phone: string;
  let otp: string;
  try {
    const wh = new Webhook(hookSecret.replace('v1,whsec_', ''));
    const verified = wh.verify(payload, Object.fromEntries(req.headers)) as {
      user?: { phone?: string };
      sms?: { otp?: string };
    };
    phone = verified.user?.phone ?? '';
    otp = verified.sms?.otp ?? '';
  } catch {
    return failure(401, 'Invalid signature.');
  }

  if (!phone || !otp) return failure(400, 'Missing phone or code.');

  // Auth sends the number as it stores it, sometimes without the leading "+".
  // Pindo wants international format.
  const to = phone.startsWith('+') ? phone : `+${phone}`;

  let res: Response;
  try {
    res = await fetch(PINDO_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        // One SMS segment, and the code first so it shows in the notification.
        text: `${otp} is your Rwanda Rentals code. Do not share it with anyone.`,
        sender,
      }),
    });
  } catch (e) {
    console.error('send-sms: could not reach Pindo', e instanceof Error ? e.message : e);
    return failure(502, 'The SMS provider could not be reached.');
  }

  if (!res.ok) {
    // Pindo's own words go to the logs, never back to the caller: they can
    // name the balance and the account.
    console.error('send-sms: Pindo refused', res.status, (await res.text()).slice(0, 300));
    return failure(502, 'The SMS could not be sent.');
  }

  return json({});
});
