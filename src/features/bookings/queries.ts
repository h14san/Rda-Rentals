import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BookingRow, BookingStatus } from '@/features/bookings/types';
import { listingKeys } from '@/features/listings/queries';
import type { ProfileRow } from '@/features/listings/types';
import { supabase } from '@/lib/supabase';

export const bookingKeys = {
  all: ['bookings'] as const,
  mine: (userId: string) => ['bookings', 'mine', userId] as const,
  forPair: (listingId: string, renterId: string) =>
    ['bookings', 'pair', listingId, renterId] as const,
  staff: (status: BookingStatus | null) => ['bookings', 'staff', status] as const,
};

type Person = Pick<ProfileRow, 'id' | 'full_name'>;

export type BookingWithPeople = BookingRow & {
  renter: Person | null;
  landlord: Person | null;
};

const SELECT =
  '*, renter:profiles!renter_id (id, full_name), landlord:profiles!landlord_id (id, full_name)';

/** Every booking the caller is part of, as renter or landlord, newest first. */
export function useMyBookings(userId: string | null) {
  return useQuery({
    queryKey: bookingKeys.mine(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(SELECT)
        // Staff can read every booking; this keeps their own list their own.
        .or(`renter_id.eq.${userId},landlord_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as BookingWithPeople[];
    },
  });
}

/**
 * The newest booking between one renter and one listing, or null. This is what
 * a conversation and a listing page show: a conversation is exactly one
 * renter and one listing.
 */
export function useBookingForPair(listingId: string | null, renterId: string | null) {
  return useQuery({
    queryKey: bookingKeys.forPair(listingId ?? '', renterId ?? ''),
    enabled: !!listingId && !!renterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(SELECT)
        .eq('listing_id', listingId!)
        .eq('renter_id', renterId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as BookingWithPeople | null;
    },
  });
}

export function useStaffBookings(status: BookingStatus | null, enabled: boolean) {
  return useQuery({
    queryKey: bookingKeys.staff(status),
    enabled,
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(100);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as BookingWithPeople[];
    },
  });
}

/**
 * A booking moves a listing's status, posts to a conversation and may release
 * an address, so every change refreshes all three.
 */
function useInvalidateBookings() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: bookingKeys.all });
    void qc.invalidateQueries({ queryKey: listingKeys.all });
    void qc.invalidateQueries({ queryKey: ['messaging'] });
  };
}

export function useRequestBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: async (input: {
      listingId: string;
      moveIn: string;
      months: number;
      message: string;
    }) => {
      const { data, error } = await supabase.rpc('request_booking', {
        p_listing_id: input.listingId,
        p_move_in: input.moveIn,
        p_months: input.months,
        p_message: input.message.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRespondBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: async (input: { bookingId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_booking', {
        p_booking_id: input.bookingId,
        p_accept: input.accept,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useConfirmBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('confirm_booking', { p_booking_id: bookingId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** `note` is required when staff cancel, and ignored otherwise. */
export function useCancelBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: async (input: { bookingId: string; note?: string }) => {
      const { error } = await supabase.rpc('cancel_booking', {
        p_booking_id: input.bookingId,
        p_note: input.note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
