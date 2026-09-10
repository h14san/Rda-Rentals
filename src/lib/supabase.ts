import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Database } from '@/features/listings/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase project values, ' +
      'then restart the dev server (env vars are inlined at build time).',
  );
}

/**
 * Session storage.
 *
 * Refresh tokens are long-lived credentials, so on device they go in the
 * platform keychain via SecureStore rather than AsyncStorage, which is plain
 * text on disk. SecureStore has a 2048-byte per-value limit; Supabase sessions
 * sit well under it, but chunking would be the fix if that ever changes.
 */
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/** SecureStore has no web implementation; fall back to AsyncStorage there. */
const storage = Platform.OS === 'web' ? AsyncStorage : SecureStoreAdapter;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection in a native app; this is a web-only flow
    // and leaving it on causes a spurious parse on every cold start.
    detectSessionInUrl: false,
  },
});

/** Public URL for an object in the listing-images bucket. */
export function imageUrl(storagePath: string): string {
  return supabase.storage.from('listing-images').getPublicUrl(storagePath).data.publicUrl;
}
