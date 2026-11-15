/** Mirrors supabase/migrations/20261117120000_notifications.sql. */

export type NotificationCategory = 'messages' | 'listings' | 'saved' | 'bookings' | 'account';

export type NotificationRow = {
  id: string;
  user_id: string;
  /**
   * message_new, verification_decided, listing_review, report_resolved,
   * listing_suspended, listing_restored, account_suspended, account_restored,
   * saved_price_drop, saved_unavailable, and booking_* once booking exists.
   * A string, not a union: an older app must still render a kind it has not
   * heard of, and it can, because the title and body arrive composed.
   */
  kind: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  collapse_key: string | null;
  read_at: string | null;
  pushed_at: string | null;
  created_at: string;
};

export type NotificationPreferencesRow = {
  user_id: string;
  messages: boolean;
  listings: boolean;
  saved: boolean;
  bookings: boolean;
  updated_at: string;
};

export type PushTokenRow = {
  token: string;
  user_id: string;
  platform: 'android' | 'ios';
  updated_at: string;
};

/** The categories a user may switch off. 'account' is deliberately absent (§37). */
export const PREFERENCE_TOGGLES: {
  key: 'messages' | 'listings' | 'saved' | 'bookings';
  label: string;
  detail: string;
}[] = [
  {
    key: 'messages',
    label: 'Messages',
    detail: 'When someone writes to you. Muted conversations stay quiet either way.',
  },
  {
    key: 'bookings',
    label: 'Bookings',
    detail: 'Requests, and when one is accepted, declined, confirmed or cancelled.',
  },
  {
    key: 'listings',
    label: 'Your listings',
    detail: 'When a listing you posted is approved, refused or needs changes.',
  },
  {
    key: 'saved',
    label: 'Saved rentals',
    detail: 'When a place you saved drops in price or stops being available.',
  },
];

export const DEFAULT_PREFERENCES = {
  messages: true,
  listings: true,
  saved: true,
  bookings: true,
};
