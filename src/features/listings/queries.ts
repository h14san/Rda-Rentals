import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  Filters,
  ListingDetail,
  ListingRow,
  ListingStatus,
  ListingWithImages,
} from '@/features/listings/types';
import { supabase } from '@/lib/supabase';

export const PAGE_SIZE = 10;

/** Feed orderings offered in the UI. */
export type SortOrder = 'newest' | 'price_asc' | 'price_desc';

export const SORT_LABELS: Record<SortOrder, string> = {
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
};

const IMAGE_SELECT = 'listing_images (id, storage_path, position)';

export const listingKeys = {
  all: ['listings'] as const,
  feed: (filters: Filters, sort: SortOrder) =>
    ['listings', 'feed', filters, sort] as const,
  detail: (id: string) => ['listings', 'detail', id] as const,
  mine: (userId: string) => ['listings', 'mine', userId] as const,
};

/** Images come back in arbitrary order; the carousel needs `position` order. */
function sortImages<T extends { listing_images?: { position: number }[] }>(row: T): T {
  row.listing_images?.sort((a, b) => a.position - b.position);
  return row;
}

/**
 * Paged feed.
 *
 * Uses offset paging rather than a keyset cursor because the ordering is
 * composite (is_featured desc, created_at desc) and a keyset over that pair is
 * far more machinery than MVP listing volumes justify. The tradeoff is that a
 * listing published mid-scroll can shift a row across a page boundary.
 */
export function useListingsFeed(filters: Filters, sort: SortOrder = 'newest') {
  return useInfiniteQuery({
    queryKey: listingKeys.feed(filters, sort),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * PAGE_SIZE;

      // Each filter maps to one indexed column. This is the whole reason the
      // brief chose Postgres over Firestore, where a compound
      // price + sector + type query needs a hand-built composite index per
      // combination. Built by reassignment rather than a generic helper so the
      // builder keeps its own inferred type.
      let query = supabase
        .from('listings')
        // count:'exact' so the feed can show how many rentals matched, which is
        // the fastest way for a tenant to tell a filter was too narrow.
        .select(`*, ${IMAGE_SELECT}`, { count: 'exact' })
        .eq('status', 'active');

      if (filters.minPrice !== null) query = query.gte('price_rwf', filters.minPrice);
      if (filters.maxPrice !== null) query = query.lte('price_rwf', filters.maxPrice);
      if (filters.district) query = query.eq('district', filters.district);
      if (filters.sector) query = query.eq('sector', filters.sector);
      if (filters.propertyType) query = query.eq('property_type', filters.propertyType);
      if (filters.minBedrooms !== null) query = query.gte('bedrooms', filters.minBedrooms);
      if (filters.furnishedOnly) query = query.eq('furnished', true);

      // Featured listings float to the top only under the default ordering.
      // Letting paid placement override an explicit "price: low to high" would
      // make the sort look broken, which costs more trust than the placement
      // is worth.
      if (sort === 'newest') {
        query = query.order('is_featured', { ascending: false });
        query = query.order('created_at', { ascending: false });
      } else {
        query = query.order('price_rwf', { ascending: sort === 'price_asc' });
      }

      const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      return {
        rows: (data as unknown as ListingWithImages[]).map(sortImages),
        total: count ?? 0,
      };
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.rows.length === PAGE_SIZE ? allPages.length : undefined,
  });
}

export function useListingDetail(id: string) {
  return useQuery({
    queryKey: listingKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(`*, ${IMAGE_SELECT}, profiles (id, full_name, whatsapp_phone, phone)`)
        .eq('id', id)
        .single();

      if (error) throw error;
      return sortImages(data as unknown as ListingDetail);
    },
  });
}

/** The landlord's own listings, including drafts and archived ones. */
export function useMyListings(userId: string) {
  return useQuery({
    queryKey: listingKeys.mine(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(`*, ${IMAGE_SELECT}`)
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as unknown as ListingWithImages[]).map(sortImages);
    },
  });
}

export function useSetListingStatus(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ListingStatus }) => {
      const { data, error } = await supabase
        .from('listings')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ListingRow;
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: listingKeys.mine(userId) });
      void qc.invalidateQueries({ queryKey: listingKeys.detail(row.id) });
      void qc.invalidateQueries({ queryKey: ['listings', 'feed'] });
    },
  });
}

/** Field edits for an existing listing. Photos are managed separately. */
export interface ListingEdit {
  title: string;
  description: string | null;
  price_rwf: number;
  property_type: ListingRow['property_type'];
  bedrooms: number | null;
  furnished: boolean;
  district: string | null;
  sector: string | null;
  address: string | null;
}

export function useUpdateListing(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ListingEdit }) => {
      const { data, error } = await supabase
        .from('listings')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ListingRow;
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: listingKeys.mine(userId) });
      void qc.invalidateQueries({ queryKey: listingKeys.detail(row.id) });
      void qc.invalidateQueries({ queryKey: ['listings', 'feed'] });
    },
  });
}

export function useDeleteListing(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Storage objects are not FK-linked, so remove them before the row goes
      // and takes the listing_images paths with it.
      const { data: images } = await supabase
        .from('listing_images')
        .select('storage_path')
        .eq('listing_id', id);

      if (images?.length) {
        await supabase.storage
          .from('listing-images')
          .remove(images.map((i) => i.storage_path));
      }

      const { error } = await supabase.from('listings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listingKeys.mine(userId) });
      void qc.invalidateQueries({ queryKey: ['listings', 'feed'] });
    },
  });
}
