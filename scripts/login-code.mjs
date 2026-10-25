#!/usr/bin/env node
/**
 * Prints a sign-in code for a tester without sending any email.
 *
 * Exists because the project's SMTP sender is Resend's onboarding@resend.dev,
 * which only delivers to the Resend account owner — every other address gets
 * "Error sending confirmation email". Until a real sender is configured, this
 * creates the user (pre-confirmed) and asks Auth to generate the code it would
 * have emailed. The tester types it into the normal verify screen, so the app's
 * auth flow is exercised unchanged.
 *
 * The secret key is fetched from the CLI at runtime and never printed or saved.
 * NON-PRODUCTION ONLY: anyone who can run this can sign in as any email.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('usage: node scripts/login-code.mjs <email>');
  process.exit(2);
}

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const base = `https://${ref}.supabase.co/auth/v1`;

// Single command string with shell:true — see the comment in run-sql.mjs.
const cli = spawnSync(
  `npx --yes supabase@latest projects api-keys --project-ref ${ref} --reveal -o json`,
  { encoding: 'utf8', shell: true },
);
const raw = cli.stdout ?? '';
const start = raw.search(/[[{]/);
if (cli.status !== 0 || start === -1) {
  console.error('Could not list API keys. Is the Supabase CLI logged in? Try: npx supabase login');
  console.error(cli.stderr);
  process.exit(1);
}

// The CLI has wrapped lists in an object before; accept either shape.
const parsed = JSON.parse(raw.slice(start));
const keys = Array.isArray(parsed) ? parsed : Object.values(parsed).find(Array.isArray) ?? [];
const found = keys.find(
  (k) =>
    (k.name === 'service_role' && k.api_key?.startsWith('eyJ')) ||
    k.api_key?.startsWith('sb_secret_'),
);
const key = found?.api_key;
if (!key || !/^[\w.-]+$/.test(key)) {
  console.error('No usable secret key found (it may be masked). Key names seen:', keys.map((k) => k.name));
  process.exit(1);
}

// New sb_secret_ keys are not JWTs and are rejected in Authorization; only the
// legacy service_role JWT goes there.
const headers = { apikey: key, 'Content-Type': 'application/json' };
if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

async function post(path, body) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

const created = await post('/admin/users', { email, email_confirm: true });
if (!created.ok && created.data?.error_code !== 'email_exists' && created.status !== 422) {
  console.error(`Creating the user failed (${created.status}):`, created.data);
  process.exit(1);
}

const link = await post('/admin/generate_link', { type: 'magiclink', email });
const code = link.data?.email_otp ?? link.data?.properties?.email_otp;
if (!link.ok || !code) {
  console.error(`Generating the code failed (${link.status}):`, link.data);
  process.exit(1);
}

console.log(`\n  ${email}\n  Sign-in code: ${code}\n\n  Valid for 1 hour, single use. Enter it on the app's verify screen.\n`);
