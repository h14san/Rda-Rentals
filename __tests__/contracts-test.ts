/**
 * Values that live in two places on purpose (the app, and Deno Edge
 * Functions the app's toolchain cannot import). CLAUDE.md says "keep them
 * identical"; these tests are what makes that more than a hope.
 *
 * The Deno files are read as text, because they use npm: specifiers and a
 * Deno global that Jest cannot load.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { AMENITIES } from '@/lib/amenities';

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

/** The quoted strings inside `const NAME = [ ... ]` in a source file. */
function arrayLiteral(source: string, name: string): string[] {
  const match = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`).exec(source);
  if (!match) throw new Error(`${name} not found`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** The string in `const NAME = '...'`. */
function stringConstant(source: string, name: string): string {
  const match = new RegExp(`const ${name} = '([^']+)'`).exec(source);
  if (!match) throw new Error(`${name} not found`);
  return match[1];
}

it('the AI search knows exactly the amenities the app does', () => {
  const edge = arrayLiteral(read('supabase/functions/_shared/filters.ts'), 'AMENITIES');
  expect(edge).toEqual([...AMENITIES]);
});

// Android silently drops a notification sent to a channel the phone lacks.
it('push is sent to the Android channel the app creates', () => {
  const app = stringConstant(read('src/lib/push.ts'), 'ANDROID_CHANNEL');
  const server = stringConstant(read('supabase/functions/send-push/index.ts'), 'ANDROID_CHANNEL');
  expect(server).toBe(app);
});
