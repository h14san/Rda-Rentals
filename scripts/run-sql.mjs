#!/usr/bin/env node
/**
 * Runs a SQL file against the linked Supabase project and fails loudly.
 *
 * Exists because `supabase db query` exits 0 even when the query errors — it
 * reports the failure as JSON on stdout instead. Calling it directly from an
 * npm script would let db:rls-check silently "pass" while the assertions it
 * runs were actually failing, which is worse than having no check at all.
 */
import { spawnSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/run-sql.mjs <path-to-sql>');
  process.exit(2);
}

// Invoked as a single shell command string rather than (command, args[]).
// On Windows npx is a .cmd shim, which Node refuses to spawn without a shell
// (EINVAL, from the CVE-2024-27980 fix), while under Git Bash only the
// extensionless shell script exists — neither is spawnable directly. Passing
// an args array alongside shell:true is separately deprecated, so the command
// is built as one pre-quoted string. The path is quoted because this project
// lives under a directory with a space in its name.
const command = `npx --yes supabase@latest db query --linked -f "${file}"`;

const result = spawnSync(command, { encoding: 'utf8', shell: true });

if (result.error) {
  console.error(`Could not run supabase CLI: ${result.error.message}`);
  process.exit(2);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);

const failed =
  result.status !== 0 ||
  /"_tag"\s*:\s*"Error"/.test(output) ||
  /Failed to run sql query/i.test(output) ||
  /\bERROR:\s/.test(output);

if (failed) {
  console.error(`\nFAILED: ${file}`);
  process.exit(1);
}

console.log(`\nOK: ${file}`);
