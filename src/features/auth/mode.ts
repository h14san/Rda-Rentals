import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * What someone is here to do: find a place, rent one out, or both.
 *
 * It only arranges the app (which tabs show, what the profile offers). It is
 * not a permission: anyone can post a listing or book one whatever they chose,
 * and the database neither knows nor checks this. That is deliberate. "Renter"
 * and "landlord" are not roles here; being a landlord is having listings.
 *
 * Stored in the auth user's own metadata rather than on `profiles`, because
 * every signed-in user can read `profiles` and this is nobody else's business.
 * It reaches the app inside the session, so it needs no query and no migration.
 */
export const ACCOUNT_MODES = ['guest', 'host', 'both'] as const;
export type AccountMode = (typeof ACCOUNT_MODES)[number];

export const ACCOUNT_MODE_COPY: Record<
  AccountMode,
  { label: string; detail: string; icon: 'search-outline' | 'home-outline' | 'swap-horizontal-outline' }
> = {
  guest: {
    label: 'Find a place to rent',
    detail: 'Browse, save and book rentals.',
    icon: 'search-outline',
  },
  host: {
    label: 'Rent out my place',
    detail: 'Post listings and answer people who want them.',
    icon: 'home-outline',
  },
  both: {
    label: 'Both',
    detail: 'Look for a place and rent one out.',
    icon: 'swap-horizontal-outline',
  },
};

/** Null when the account has not chosen yet (it is asked during setup). */
export function accountModeOf(session: Session | null): AccountMode | null {
  const value = session?.user.user_metadata?.account_mode;
  return (ACCOUNT_MODES as readonly string[]).includes(value) ? (value as AccountMode) : null;
}

/**
 * Saves the choice. supabase-js then emits USER_UPDATED with the new session,
 * so the auth context, and with it the tab bar, follows without a refetch.
 */
export async function setAccountMode(mode: AccountMode): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { account_mode: mode } });
  if (error) throw error;
}

export const lists = (mode: AccountMode | null) => mode === 'host' || mode === 'both';
export const rents = (mode: AccountMode | null) => mode !== 'host';
