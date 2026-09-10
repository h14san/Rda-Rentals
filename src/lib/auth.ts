import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * Auth channel abstraction.
 *
 * The brief specifies phone OTP, which is right for Rwanda — email is not
 * universal. But Supabase does not send SMS itself: it delegates to Twilio /
 * Vonage / MessageBird, all of which are paid, with no free tier for Rwandan
 * numbers. So the app is built against *email* OTP by default and flips to SMS
 * with one env var once an SMS provider exists.
 *
 * Both channels are one-time-code flows with an identical two-step shape
 * (enter identifier -> enter 6-digit code), which is why the sign-in screens
 * need no changes when the channel switches. Deliberately NOT email+password:
 * that would need a different screen and would have to be thrown away later.
 */

export type AuthChannel = 'email' | 'phone';

export const AUTH_CHANNEL: AuthChannel =
  process.env.EXPO_PUBLIC_AUTH_CHANNEL === 'phone' ? 'phone' : 'email';

/**
 * Digits in the emailed/texted code.
 *
 * Channel-dependent, and the two differ on this project: `auth.email.otp_length`
 * is 8 while `auth.sms.otp_length` is 6 (supabase/config.toml). Hardcoding
 * either one breaks the other channel silently — the input caps below the real
 * code length, so the Verify button never enables and no error is shown.
 * Re-check both values before changing EXPO_PUBLIC_AUTH_CHANNEL.
 */
export const OTP_LENGTH = AUTH_CHANNEL === 'phone' ? 6 : 8;

const RW_COUNTRY_CODE = '250';

/**
 * Normalise a Rwandan mobile number to E.164 (+250XXXXXXXXX).
 *
 * Accepts what people actually type: 0788123456, 788123456, 250788123456,
 * +250 788 123 456, and the same with dashes.
 * Returns null when the input cannot be a Rwandan mobile number.
 */
export function normalizeRwandanPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;

  let national: string;
  if (digits.startsWith(RW_COUNTRY_CODE) && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    national = digits;
  } else {
    return null;
  }

  // Rwandan mobile numbers are 9 national digits starting with 7
  // (72/73 Airtel, 78/79 MTN).
  if (!/^7[2389]\d{7}$/.test(national)) return null;

  return `+${RW_COUNTRY_CODE}${national}`;
}

/** Display form: +250 788 123 456. */
export function formatRwandanPhone(e164: string): string {
  const m = /^\+250(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+250 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate and canonicalise whatever the user typed into the identifier field,
 * according to the active channel.
 */
export function normalizeIdentifier(raw: string): string | null {
  const trimmed = raw.trim();
  if (AUTH_CHANNEL === 'phone') return normalizeRwandanPhone(trimmed);
  return EMAIL_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

export const IDENTIFIER_LABEL = AUTH_CHANNEL === 'phone' ? 'Phone number' : 'Email address';

export const IDENTIFIER_PLACEHOLDER =
  AUTH_CHANNEL === 'phone' ? '0788 123 456' : 'you@example.com';

export const IDENTIFIER_HINT =
  AUTH_CHANNEL === 'phone'
    ? 'We will text you a 6-digit code.'
    : 'We will email you a 6-digit code.';

/** Step 1: request a one-time code. `identifier` must already be normalised. */
export async function requestCode(identifier: string): Promise<void> {
  const { error } =
    AUTH_CHANNEL === 'phone'
      ? await supabase.auth.signInWithOtp({ phone: identifier })
      : await supabase.auth.signInWithOtp({
          email: identifier,
          options: { shouldCreateUser: true },
        });

  if (error) throw error;
}

/** Step 2: exchange the code for a session. */
export async function verifyCode(identifier: string, code: string): Promise<Session> {
  const { data, error } =
    AUTH_CHANNEL === 'phone'
      ? await supabase.auth.verifyOtp({ phone: identifier, token: code, type: 'sms' })
      : await supabase.auth.verifyOtp({ email: identifier, token: code, type: 'email' });

  if (error) throw error;
  if (!data.session) throw new Error('Verification succeeded but no session was returned.');
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
