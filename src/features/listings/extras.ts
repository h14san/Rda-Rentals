import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { filtersSchema, type Filters, type ProfileRow } from '@/features/listings/types';
import { messageFromFunctionError } from '@/lib/edge-functions';
import { supabase } from '@/lib/supabase';

/**
 * Saved searches, reviews and account deletion: three small features that each
 * have one table or function behind them. Mirrors
 * supabase/migrations/20261123120000_launch_gaps.sql.
 */

/* -------------------------------------------------------------------------- */
/* Saved searches                                                             */
/* -------------------------------------------------------------------------- */

export type SavedSearchRow = {
  id: string;
  user_id: string;
  name: string;
  /** A Filters object. Re-validated before use: it is stored as plain JSON. */
  filters: unknown;
  created_at: string;
};

export const MAX_SAVED_SEARCHES = 10;

const savedSearchKey = (userId: string) => ['savedSearches', userId] as const;

export function useSavedSearches(userId: string | null) {
  return useQuery({
    queryKey: savedSearchKey(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_searches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as SavedSearchRow[]).flatMap((row) => {
        // A row the current app cannot read as Filters is skipped, not shown
        // as a search that would silently match everything.
        const parsed = filtersSchema.safeParse(row.filters);
        return parsed.success ? [{ ...row, filters: parsed.data as Filters }] : [];
      });
    },
  });
}

export function useSaveSearch(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; filters: Filters }) => {
      const { error } = await supabase
        .from('saved_searches')
        .insert({ user_id: userId, name: input.name.slice(0, 80), filters: input.filters });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: savedSearchKey(userId) }),
  });
}

export function useDeleteSavedSearch(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_searches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: savedSearchKey(userId) }),
  });
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

export type ReviewRow = {
  id: string;
  booking_id: string;
  listing_id: string | null;
  landlord_id: string;
  author_id: string | null;
  rating: number;
  body: string | null;
  created_at: string;
};

export type ReviewWithAuthor = ReviewRow & {
  author: Pick<ProfileRow, 'full_name'> | null;
};

const reviewKeys = {
  listing: (id: string) => ['reviews', 'listing', id] as const,
  mine: (userId: string) => ['reviews', 'mine', userId] as const,
};

export function useListingReviews(listingId: string) {
  return useQuery({
    queryKey: reviewKeys.listing(listingId),
    enabled: !!listingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*, author:profiles!author_id (full_name)')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as ReviewWithAuthor[];
    },
  });
}

/** Booking ids the caller has already reviewed, to hide "Write a review". */
export function useMyReviewedBookings(userId: string | null) {
  return useQuery({
    queryKey: reviewKeys.mine(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('booking_id')
        .eq('author_id', userId!);
      if (error) throw error;
      return new Set(data.map((r) => r.booking_id));
    },
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; rating: number; body: string }) => {
      const { error } = await supabase.rpc('submit_review', {
        p_booking_id: input.bookingId,
        p_rating: input.rating,
        p_body: input.body.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reviews'] }),
  });
}

/** "4.5" and a count, or null when there is nothing to average. */
export function reviewSummary(reviews: ReviewRow[]): { average: string; count: number } | null {
  if (reviews.length === 0) return null;
  const mean = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return { average: mean.toFixed(1), count: reviews.length };
}

/* -------------------------------------------------------------------------- */
/* Account deletion                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Deletes the signed-in account, for good. The function refuses while a
 * booking is in progress and says so; that message is what is thrown.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) {
        throw new Error(
          await messageFromFunctionError(error, 'Could not delete your account.'),
        );
      }
      // The account no longer exists; drop the local session without asking
      // the server to revoke a token it has already forgotten.
      await supabase.auth.signOut({ scope: 'local' });
    },
  });
}
