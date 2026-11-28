/**
 * Values that live in two places on purpose (the app, and Deno Edge
 * Functions the app's toolchain cannot import). CLAUDE.md says "keep them
 * identical"; these tests are what makes that more than a hope.
 *
 * The Deno files are read as text, because they use npm: specifiers and a
 * Deno global that Jest cannot load.
 */
import { readdirSync, readFileSync } from 'fs';
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

// The real pin is anywhere in the disc the offset is drawn from; a smaller
// circle on the map would sometimes exclude the property it describes.
it('the map circle matches the disc the approximate point is drawn from', () => {
  // Read as text: maps.ts imports react-native's Linking and the app's Alert.
  const app = /const APPROX_RADIUS_M = (\d+)/.exec(read('src/lib/maps.ts'));
  if (!app) throw new Error('APPROX_RADIUS_M not found');

  // The newest migration that sets the default wins, as it does in the database.
  const discs = readdirSync(join(__dirname, '..', 'supabase/migrations'))
    .sort()
    .flatMap((file) => [
      ...read(`supabase/migrations/${file}`).matchAll(
        /offset_m\s+double precision[^,]*default \((\d+) \* sqrt\(random\(\)\)\)/g,
      ),
    ]);
  expect(discs.length).toBeGreaterThan(0);
  expect(discs.at(-1)![1]).toBe(app[1]);
});
