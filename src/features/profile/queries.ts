import { useQuery } from '@tanstack/react-query';

import type {
  ListingWithImages,
  ProfileBadgeRow,
  ProfileRow,
} from '@/features/listings/types';
import { supabase } from '@/lib/supabase';

export type PublicProfile = Pick<ProfileRow, 'id' | 'full_name' | 'created_at'> & {
  profile_badges: Pick<ProfileBadgeRow, 'kind' | 'checked_at'>[];
  /** Live listings only, newest first. RLS hides everything else anyway. */
  listings: ListingWithImages[];
};

/**
 * What one user may see of another: a name, when they joined, what was checked
 * about them, and their live listings. Never a contact number (rules 1 and 2),
 * so the select names its columns rather than taking the row.
 */
export function usePublicProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', 'public', userId] as const,
    enabled: !!userId,
    queryFn: async (): Promise<PublicProfile> => {
      const [profile, listings] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, created_at, profile_badges (kind, checked_at)')
          .eq('id', userId)
          .single(),
        supabase
          .from('listings')
          .select(
            '*, listing_images (id, storage_path, position), listing_badges (kind, checked_at)',
          )
          .eq('owner_id', userId)
          .eq('status', 'published')
          .order('created_at', { ascending: false }),
      ]);
      if (profile.error) throw profile.error;
      if (listings.error) throw listings.error;

      const rows = listings.data as unknown as ListingWithImages[];
      for (const row of rows) row.listing_images?.sort((a, b) => a.position - b.position);

      return {
        ...(profile.data as unknown as Omit<PublicProfile, 'listings'>),
        listings: rows,
      };
    },
  });
}
