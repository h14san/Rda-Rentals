import type { ListingRow } from '@/features/listings/types';

/** Mirrors supabase/migrations/20261120120000_booking.sql. */

export type BookingMode = 'instant' | 'request';

/**
 * payment_required and payment_confirmed exist in the database's list so
 * Phase 6 need not rewrite it. Nothing can enter them yet (rule 14).
 */
export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'payment_required'
  | 'payment_confirmed'
  | 'confirmed'
  | 'completed';

export type BookingRow = {
  id: string;
  /** Null once the listing has been deleted; listing_title still reads. */
  listing_id: string | null;
  listing_title: string;
  renter_id: string;
  landlord_id: string;
  mode: BookingMode;
  /** ISO date (YYYY-MM-DD). */
  move_in_date: string;
  duration_months: number;
  status: BookingStatus;
  expires_at: string | null;
  cancelled_by: 'renter' | 'landlord' | 'staff' | null;
  created_at: string;
  responded_at: string | null;
  confirmed_at: string | null;
  closed_at: string | null;
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: 'Waiting for the landlord',
  accepted: 'Accepted, waiting to be confirmed',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
  payment_required: 'Payment needed',
  payment_confirmed: 'Payment received',
  confirmed: 'Confirmed',
  completed: 'Moved in',
};

export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['requested', 'accepted', 'confirmed'];

export function isActiveBooking(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}

/** Stay lengths offered when booking. The database accepts 1 to 60. */
export const DURATION_OPTIONS = [1, 3, 6, 12, 24] as const;

/**
 * Whether these dates would book instantly. Mirrors request_booking(), which
 * is what actually decides; this only labels the button truthfully beforehand.
 * The rules are deliberately few (rule 10): a named account, and dates that
 * meet the terms the landlord already published.
 */
export function wouldBookInstantly(
  listing: Pick<ListingRow, 'instant_book_enabled' | 'available_from' | 'min_rental_months'>,
  moveIn: string,
  months: number,
  hasName: boolean,
): boolean {
  return (
    listing.instant_book_enabled &&
    hasName &&
    (listing.available_from === null || moveIn >= listing.available_from) &&
    months >= (listing.min_rental_months ?? 1)
  );
}

/** What each setting means for the landlord, in the words the edit screen shows (§22). */
export const BOOKING_MODE_COPY = {
  request: {
    label: 'Request to book',
    detail:
      'A renter asks, and you have 72 hours to accept or decline. Nothing is booked until you accept and they confirm.',
  },
  instant: {
    label: 'Instant Book',
    detail:
      'A renter whose move-in date and length of stay meet your terms books at once, without asking you first. They see the exact address straight away, and the listing leaves the feed.',
  },
} as const;
