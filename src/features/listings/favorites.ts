import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ListingWithImages } from '@/features/listings/types';
import { supabase } from '@/lib/supabase';

/**
 * Favorites: one list per renter (Blueprint §15, no collections).
 *
 * Two queries on purpose. The id set is tiny and drives every heart in the
 * feed, so it is fetched once and toggled optimistically; the full saved list
 * with images is only fetched on the Saved tab.
 */

/** Features #19: two to four side by side. More stops fitting on a phone. */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

export const favoriteKeys = {
  ids: (userId: string) => ['favorites', 'ids', userId] as const,
  list: (userId: string) => ['favorites', 'list', userId] as const,
};

export type SavedListing = {
  listing_id: string;
  price_at_save: number | null;
  created_at: string;
  /**
   * Null when the listing was deleted, suspended or rejected: RLS hides it, and
   * the favorite row outlives it until the renter removes it.
   */
  listings: ListingWithImages | null;
};

export function useFavoriteIds(userId: string | null) {
  return useQuery({
    queryKey: favoriteKeys.ids(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('favorites')
        .select('listing_id')
        .eq('user_id', userId!);
      if (error) throw error;
      return new Set(data.map((r) => r.listing_id));
    },
  });
}

export function useSavedListings(userId: string) {
  return useQuery({
    queryKey: favoriteKeys.list(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('favorites')
        .select(
          'listing_id, price_at_save, created_at, listings (*, listing_images (id, storage_path, position))',
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data as unknown as SavedListing[];
      for (const r of rows)
        r.listings?.listing_images.sort((a, b) => a.position - b.position);
      return rows;
    },
  });
}

/**
 * Save or unsave. Optimistic, because a heart that waits a round trip on a
 * slow connection reads as a missed tap and gets tapped again.
 */
export function useToggleFavorite(userId: string) {
  const qc = useQueryClient();
  const key = favoriteKeys.ids(userId);

  return useMutation({
    mutationFn: async ({ listingId, save }: { listingId: string; save: boolean }) => {
      const { error } = save
        ? await supabase
            .from('favorites')
            .insert({ user_id: userId, listing_id: listingId })
        : await supabase
            .from('favorites')
            .delete()
            .eq('user_id', userId)
            .eq('listing_id', listingId);
      if (error) throw error;
    },
    onMutate: async ({ listingId, save }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Set<string>>(key);
      const next = new Set(previous);
      if (save) next.add(listingId);
      else next.delete(listingId);
      qc.setQueryData(key, next);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

/** What changed since the renter saved it, if anything worth saying. */
export function savedChange(saved: SavedListing): string | null {
  const l = saved.listings;
  if (!l) return 'No longer listed';
  if (l.status === 'rented') return 'Rented';
  if (l.status !== 'published') return 'Not available right now';
  if (saved.price_at_save !== null && l.price_rwf < saved.price_at_save)
    return 'Price dropped';
  if (saved.price_at_save !== null && l.price_rwf > saved.price_at_save)
    return 'Price went up';
  return null;
}

/**
 * Props for a card's heart. Returns undefined when signed out, which hides it.
 * Also returns the id set, for FlashList's extraData: without it a toggled
 * heart would not re-render until the row scrolled out and back.
 */
export function useFavoriteControl(userId: string | null) {
  const ids = useFavoriteIds(userId);
  const toggle = useToggleFavorite(userId ?? '');
  const saved = ids.data;

  const propsFor = (listingId: string) => {
    if (!userId) return undefined;
    const isSaved = saved?.has(listingId) ?? false;
    return {
      saved: isSaved,
      onToggle: () => toggle.mutate({ listingId, save: !isSaved }),
    };
  };

  return { propsFor, savedIds: saved };
}
