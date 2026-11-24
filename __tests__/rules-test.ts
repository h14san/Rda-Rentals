/**
 * Product rules the app mirrors from the database.
 *
 * The database decides (request_booking, listings_guard_status). These tests
 * pin the app's copies, so a screen never offers a move the server refuses or
 * labels a button with something the server will not do.
 */
import { accountModeOf, lists, rents } from '@/features/auth/mode';
import {
  ACTIVE_BOOKING_STATUSES,
  isActiveBooking,
  wouldBookInstantly,
  type BookingStatus,
} from '@/features/bookings/types';
import {
  LANDLORD_STATUS_ACTIONS,
  LISTING_STATUSES,
  PUBLISH_TARGET,
  type ListingStatus,
} from '@/features/listings/types';
import type { Session } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('wouldBookInstantly (mirrors request_booking)', () => {
  const listing = {
    instant_book_enabled: true,
    available_from: '2026-12-01',
    min_rental_months: 6,
  };

  it('books at once when the dates meet the published terms', () => {
    expect(wouldBookInstantly(listing, '2026-12-01', 6, true)).toBe(true);
    expect(wouldBookInstantly(listing, '2027-01-01', 12, true)).toBe(true);
  });

  it('is a request when the landlord has not opted in', () => {
    expect(wouldBookInstantly({ ...listing, instant_book_enabled: false }, '2026-12-01', 6, true)).toBe(false);
  });

  it('needs a named profile', () => {
    expect(wouldBookInstantly(listing, '2026-12-01', 6, false)).toBe(false);
  });

  it('refuses a move-in before the listing is available', () => {
    expect(wouldBookInstantly(listing, '2026-11-30', 6, true)).toBe(false);
  });

  it('refuses a stay shorter than the minimum', () => {
    expect(wouldBookInstantly(listing, '2026-12-01', 5, true)).toBe(false);
  });

  it('treats unstated terms as no restriction', () => {
    const open = { instant_book_enabled: true, available_from: null, min_rental_months: null };
    expect(wouldBookInstantly(open, '2026-11-21', 1, true)).toBe(true);
  });
});

describe('booking statuses', () => {
  it('counts only requested, accepted and confirmed as in progress', () => {
    expect(ACTIVE_BOOKING_STATUSES.sort()).toEqual(['accepted', 'confirmed', 'requested']);
  });

  // Rule 14: payment states exist for Phase 6 and nothing may enter them yet.
  it.each<BookingStatus>(['payment_required', 'payment_confirmed', 'declined', 'expired', 'cancelled', 'completed'])(
    '%s is not in progress',
    (status) => {
      expect(isActiveBooking(status)).toBe(false);
    },
  );
});

describe('what a landlord may do to a listing (mirrors listings_guard_status)', () => {
  const moves = Object.entries(LANDLORD_STATUS_ACTIONS).flatMap(([from, actions]) =>
    (actions ?? []).map((a) => ({ from: from as ListingStatus, to: a.to })),
  );

  it('only offers statuses that exist', () => {
    for (const { from, to } of moves) {
      expect(LISTING_STATUSES).toContain(from);
      expect(LISTING_STATUSES).toContain(to);
    }
  });

  it('sends a draft to review, never straight to the public feed (rule 9)', () => {
    expect(PUBLISH_TARGET).toBe('pending_review');
    expect(LANDLORD_STATUS_ACTIONS.draft?.map((a) => a.to)).toEqual(['pending_review']);
  });

  it('never lets a landlord approve, reject or suspend', () => {
    const staffOnly: ListingStatus[] = ['rejected', 'suspended', 'booking_pending', 'reserved'];
    for (const { to } of moves) expect(staffOnly).not.toContain(to);
  });

  it('offers nothing while a listing is in review, suspended, or held by a booking', () => {
    for (const s of ['pending_review', 'suspended', 'booking_pending'] as const) {
      expect(LANDLORD_STATUS_ACTIONS[s] ?? []).toEqual([]);
    }
  });

  it('publishes only from a status that was already approved', () => {
    const republishFrom = moves.filter((m) => m.to === 'published').map((m) => m.from).sort();
    expect(republishFrom).toEqual(['paused', 'rented', 'unavailable']);
  });

  it('lets a reserved listing only become rented (the move-in)', () => {
    expect(LANDLORD_STATUS_ACTIONS.reserved?.map((a) => a.to)).toEqual(['rented']);
  });
});

describe('account mode (arranges the app, never a permission)', () => {
  const session = (account_mode: unknown) =>
    ({ user: { user_metadata: { account_mode } } }) as unknown as Session;

  it('reads a valid choice from the auth metadata', () => {
    expect(accountModeOf(session('host'))).toBe('host');
  });

  it('treats anything else as not chosen yet', () => {
    expect(accountModeOf(session('admin'))).toBeNull();
    expect(accountModeOf(session(undefined))).toBeNull();
    expect(accountModeOf(null)).toBeNull();
  });

  it('decides which tabs show', () => {
    expect([lists('guest'), rents('guest')]).toEqual([false, true]);
    expect([lists('host'), rents('host')]).toEqual([true, false]);
    expect([lists('both'), rents('both')]).toEqual([true, true]);
    // Before choosing, the app behaves as a renter's.
    expect([lists(null), rents(null)]).toEqual([false, true]);
  });
});
