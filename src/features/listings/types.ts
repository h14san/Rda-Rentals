import { z } from 'zod';

import type { BookingRow } from '@/features/bookings/types';
import type {
  ConversationParticipantRow,
  ConversationRow,
  MessageRow,
  StaffTranscript,
  UserBlockRow,
} from '@/features/messaging/types';
import type {
  NotificationPreferencesRow,
  NotificationRow,
  PushTokenRow,
} from '@/features/notifications/types';
import type {
  AccountRestrictionRow,
  ListingSuspensionRow,
  ModerationAction,
  ModerationEventRow,
  ReportReason,
  ReportRow,
  ReportSeverity,
  ReportTarget,
} from '@/features/moderation/types';
import { AMENITIES, AMENITY_LABELS } from '@/lib/amenities';
import { formatPrice } from '@/lib/format';

/**
 * Hand-written to match supabase/migrations/ (all of them, in order).
 *
 * Once a real project exists, regenerate instead of editing:
 *   npx supabase gen types typescript --project-id <ref> > src/features/listings/types.gen.ts
 * and re-export Database from there. Until then this is the contract.
 */

export const PROPERTY_TYPES = ['studio', 'apartment', 'shared', 'house'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * Mirrors the check constraint. Which moves a landlord may make is decided by
 * the listings_guard_status trigger; LANDLORD_STATUS_ACTIONS below only
 * offers the ones it will accept.
 */
export const LISTING_STATUSES = [
  'draft',
  'pending_review',
  'published',
  'paused',
  'unavailable',
  'rented',
  'rejected',
  'suspended',
  // Set only by the booking functions. Neither is on the public feed.
  'booking_pending',
  'reserved',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  studio: 'Studio',
  apartment: 'Apartment',
  shared: 'Shared',
  house: 'House',
};

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  published: 'Live',
  paused: 'Paused',
  unavailable: 'Unavailable',
  rented: 'Rented',
  rejected: 'Rejected',
  suspended: 'Suspended',
  booking_pending: 'Booking pending',
  reserved: 'Reserved',
};

/**
 * Where a draft goes when the landlord submits it.
 *
 * Review, never straight to live: rule 9 says the landlord is verified before
 * anything is public. The listings_guard_status trigger is what enforces it,
 * and entering pending_review opens the review case by trigger too, so this
 * one update is the whole submission.
 */
export const PUBLISH_TARGET: ListingStatus = 'pending_review';

/**
 * What the landlord is told when an edit sends an approved listing back to
 * review. Mirrors listing_material_edit(): location and photos do, rent, terms
 * and description do not.
 */
export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  location: 'You changed the location, so it has to be checked again.',
  photos: 'You changed the photos, so they have to be checked again.',
};

/** The status changes a landlord is offered, per current status. */
export const LANDLORD_STATUS_ACTIONS: Partial<
  Record<ListingStatus, { to: ListingStatus; label: string }[]>
> = {
  draft: [{ to: PUBLISH_TARGET, label: 'Submit for review' }],
  published: [
    { to: 'rented', label: 'Mark rented' },
    { to: 'paused', label: 'Pause' },
  ],
  paused: [{ to: 'published', label: 'Republish' }],
  unavailable: [{ to: 'published', label: 'Republish' }],
  rented: [{ to: 'published', label: 'Available again' }],
  rejected: [{ to: 'draft', label: 'Back to draft' }],
  // The renter has moved in; this also completes the booking. There is no way
  // out of booking_pending here: cancelling the booking is how that ends.
  reserved: [{ to: 'rented', label: 'Mark rented (moved in)' }],
};

export type ReviewReason = 'location' | 'photos';

export type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ListingRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  price_rwf: number;
  property_type: PropertyType;
  bedrooms: number | null;
  furnished: boolean;
  district: string | null;
  sector: string | null;
  bathrooms: number | null;
  size_sqm: number | null;
  deposit_rwf: number | null;
  min_rental_months: number | null;
  /** ISO date (YYYY-MM-DD). Null means available now. */
  available_from: string | null;
  /** Keys from src/lib/amenities.ts. Read through knownAmenities(). */
  amenities: string[];
  /** Stamped by the server on publish and on "Still available". */
  availability_confirmed_at: string | null;
  /**
   * A point up to 500 m from the property, derived by trigger from
   * listing_locations. Never write these; the exact pin is private.
   */
  approx_latitude: number | null;
  approx_longitude: number | null;
  /**
   * Why an approved listing must be reviewed again: its location or photos
   * changed. Set and cleared only by the database; a write from the app is
   * ignored. Non-null on a paused, unavailable or rented listing means
   * "republish" will send it to review instead.
   */
  review_reason: ReviewReason | null;
  /** Rule 7: the landlord chooses. The database requires at least one. */
  instant_book_enabled: boolean;
  request_to_book_enabled: boolean;
  status: ListingStatus;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type ListingImageRow = {
  id: string;
  listing_id: string;
  storage_path: string;
  position: number;
  created_at: string;
};

/**
 * The exact location. Owner-only under RLS, so for anyone else the embed on a
 * listing comes back null rather than erroring.
 */
export type ListingLocationRow = {
  listing_id: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  offset_bearing: number;
  offset_m: number;
  updated_at: string;
};

/** A listing joined with its images, as the feed and detail screens consume it. */
export type ListingWithImages = ListingRow & {
  listing_images: Pick<ListingImageRow, 'id' | 'storage_path' | 'position'>[];
  /** Embedded by the feed and detail selects; absent where not selected. */
  listing_badges?: Pick<ListingBadgeRow, 'kind' | 'checked_at'>[];
};

/** Detail screen additionally needs the landlord's name and badges. Never a contact number. */
export type ListingDetail = ListingWithImages & {
  profiles:
    | (Pick<ProfileRow, 'id' | 'full_name'> & {
        profile_badges: Pick<ProfileBadgeRow, 'kind' | 'checked_at'>[];
      })
    | null;
  listing_locations: Pick<ListingLocationRow, 'address' | 'latitude' | 'longitude'> | null;
};

/* Verification. Labels and screens live in src/features/verification. */

export type StaffRole = 'admin' | 'verifier';
export type CaseSubject = 'landlord' | 'listing';
export type CaseStatus = 'submitted' | 'changes_requested' | 'approved' | 'rejected';
export type CaseDecision = Exclude<CaseStatus, 'submitted'>;
export type EvidenceKind =
  | 'id_document'
  | 'ownership_document'
  | 'authorization_letter'
  | 'other';
export type ProfileBadgeKind = 'identity_checked';
export type ListingBadgeKind =
  | 'authorization_checked'
  | 'existence_checked'
  | 'information_checked';

export type VerificationCaseRow = {
  id: string;
  subject_type: CaseSubject;
  profile_id: string;
  listing_id: string | null;
  status: CaseStatus;
  submitted_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  /** Set when an already-approved listing came back because of an edit. */
  reopen_reason: ReviewReason | null;
};

export type VerificationEvidenceRow = {
  id: string;
  case_id: string;
  kind: EvidenceKind;
  storage_path: string;
  uploaded_at: string;
};

export type ProfileBadgeRow = {
  profile_id: string;
  kind: ProfileBadgeKind;
  checked_at: string;
  case_id: string | null;
};

export type ListingBadgeRow = {
  listing_id: string;
  kind: ListingBadgeKind;
  checked_at: string;
  case_id: string | null;
};

export type Database = {
  // postgrest-js reads this to pick its response types; without it every table
  // resolves to `never` and each insert/update fails to typecheck.
  __InternalSupabase: { PostgrestVersion: '12' };
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      listings: {
        Row: ListingRow;
        Insert: Omit<
          ListingRow,
          | 'id'
          | 'created_at'
          | 'updated_at'
          | 'approx_latitude'
          | 'approx_longitude'
          | 'review_reason'
          | 'availability_confirmed_at'
          | 'bathrooms'
          | 'size_sqm'
          | 'deposit_rwf'
          | 'min_rental_months'
          | 'available_from'
          | 'amenities'
          | 'instant_book_enabled'
          | 'request_to_book_enabled'
        > &
          Partial<
            Pick<
              ListingRow,
              | 'instant_book_enabled'
              | 'request_to_book_enabled'
              | 'bathrooms'
              | 'size_sqm'
              | 'deposit_rwf'
              | 'min_rental_months'
              | 'available_from'
              | 'amenities'
            >
          > & {
            id?: string;
          };
        Update: Partial<
          Omit<
            ListingRow,
            'id' | 'owner_id' | 'approx_latitude' | 'approx_longitude' | 'review_reason'
          >
        >;
        Relationships: [];
      };
      listing_locations: {
        Row: ListingLocationRow;
        // The offsets are set once by the database; the app never supplies them.
        Insert: Pick<ListingLocationRow, 'listing_id'> &
          Partial<Pick<ListingLocationRow, 'address' | 'latitude' | 'longitude'>>;
        Update: Partial<Pick<ListingLocationRow, 'address' | 'latitude' | 'longitude'>>;
        Relationships: [];
      };
      favorites: {
        Row: {
          user_id: string;
          listing_id: string;
          price_at_save: number | null;
          created_at: string;
        };
        // price_at_save is captured by trigger; the client never supplies it.
        Insert: { user_id: string; listing_id: string };
        Update: never;
        Relationships: [];
      };
      listing_status_history: {
        Row: {
          id: number;
          listing_id: string;
          from_status: ListingStatus | null;
          to_status: ListingStatus;
          changed_by: string | null;
          changed_at: string;
        };
        // Written only by trigger; there is no insert or update policy.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      listing_images: {
        Row: ListingImageRow;
        Insert: Omit<ListingImageRow, 'id' | 'created_at'> & { id?: string };
        Update: Partial<ListingImageRow>;
        Relationships: [];
      };
      // Everything below is written only by database functions, except
      // evidence rows, which the case's owner adds while the case is open.
      user_roles: {
        Row: { user_id: string; role: StaffRole; granted_by: string | null; granted_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      verification_cases: {
        Row: VerificationCaseRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      verification_evidence: {
        Row: VerificationEvidenceRow;
        Insert: Pick<VerificationEvidenceRow, 'case_id' | 'kind' | 'storage_path'>;
        Update: never;
        Relationships: [];
      };
      verification_events: {
        Row: {
          id: number;
          case_id: string;
          actor: string | null;
          action: string;
          note: string | null;
          at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profile_badges: {
        Row: ProfileBadgeRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      listing_badges: {
        Row: ListingBadgeRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // A reporter inserts their own report; everything else about it, and
      // every table below, is written only by the moderation functions.
      reports: {
        Row: ReportRow;
        Insert: {
          reporter_id: string;
          target_type: ReportTarget;
          target_id: string;
          reason: ReportReason;
          note?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      account_restrictions: {
        Row: AccountRestrictionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      listing_suspensions: {
        Row: ListingSuspensionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      moderation_events: {
        Row: ModerationEventRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Conversations are created by start_conversation(). A participant
      // inserts only their own text; the server may mask it on the way in.
      conversations: {
        Row: ConversationRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: { conversation_id: string; sender_id: string; body: string };
        Update: never;
        Relationships: [];
      };
      conversation_participants: {
        Row: ConversationParticipantRow;
        Insert: never;
        Update: Partial<
          Pick<ConversationParticipantRow, 'last_read_at' | 'archived' | 'muted'>
        >;
        Relationships: [];
      };
      user_blocks: {
        Row: UserBlockRow;
        Insert: Pick<UserBlockRow, 'blocker_id' | 'blocked_id'>;
        Update: never;
        Relationships: [];
      };
      // Changed only through the booking functions; there is no write policy.
      bookings: {
        Row: BookingRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Written only by notify_user(); a user may mark their own read.
      notifications: {
        Row: NotificationRow;
        Insert: never;
        Update: { read_at: string };
        Relationships: [];
      };
      // Written only by register_push_token() / unregister_push_token().
      push_tokens: {
        Row: PushTokenRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferencesRow;
        Insert: Partial<NotificationPreferencesRow> & { user_id: string };
        Update: Partial<NotificationPreferencesRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      request_identity_verification: { Args: Record<string, never>; Returns: string };
      resubmit_listing_case: { Args: { p_listing_id: string }; Returns: undefined };
      decide_verification: {
        Args: {
          p_case_id: string;
          p_decision: CaseDecision;
          p_note?: string | null;
          p_checks?: ListingBadgeKind[];
        };
        Returns: undefined;
      };
      staff_listing_location: {
        Args: { p_listing_id: string };
        Returns: { address: string | null; latitude: number | null; longitude: number | null }[];
      };
      request_booking: {
        Args: {
          p_listing_id: string;
          p_move_in: string;
          p_months: number;
          p_message?: string | null;
        };
        Returns: string;
      };
      respond_booking: { Args: { p_booking_id: string; p_accept: boolean }; Returns: undefined };
      confirm_booking: { Args: { p_booking_id: string }; Returns: undefined };
      cancel_booking: {
        Args: { p_booking_id: string; p_note?: string | null };
        Returns: undefined;
      };
      set_staff_role: {
        Args: { p_user_id: string; p_role: StaffRole; p_grant: boolean };
        Returns: undefined;
      };
      // Typed loosely here and narrowed in features/staff/queries.ts, which
      // owns the shapes; importing them would make this file depend on staff.
      staff_audit_log: {
        Args: { p_actor?: string | null; p_subject_id?: string | null; p_limit?: number };
        Returns: unknown[];
      };
      staff_stats: { Args: Record<string, never>; Returns: unknown };
      register_push_token: {
        Args: { p_token: string; p_platform: 'android' | 'ios' };
        Returns: undefined;
      };
      unregister_push_token: { Args: { p_token: string }; Returns: undefined };
      start_conversation: { Args: { p_listing_id: string }; Returns: string };
      staff_report_conversation: { Args: { p_report_id: string }; Returns: StaffTranscript };
      triage_report: {
        Args: { p_report_id: string; p_severity: ReportSeverity };
        Returns: undefined;
      };
      resolve_report: {
        Args: { p_report_id: string; p_outcome: 'resolved' | 'dismissed'; p_note: string };
        Returns: undefined;
      };
      moderate_listing: {
        Args: {
          p_listing_id: string;
          p_action: ModerationAction;
          p_note: string;
          p_report_id?: string | null;
        };
        Returns: undefined;
      };
      restrict_account: {
        Args: {
          p_user_id: string;
          p_action: ModerationAction;
          p_note: string;
          p_report_id?: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/**
 * Feed filters.
 *
 * This shape is deliberately the single description of "what can be searched".
 * The natural-language search and the chatbot target this object rather than
 * building their own query, so anything the AI can express is already
 * expressible here.
 */
export const filtersSchema = z.object({
  minPrice: z.number().int().positive().nullable().default(null),
  maxPrice: z.number().int().positive().nullable().default(null),
  district: z.string().nullable().default(null),
  sector: z.string().nullable().default(null),
  propertyType: z.enum(PROPERTY_TYPES).nullable().default(null),
  minBedrooms: z.number().int().min(0).max(20).nullable().default(null),
  furnishedOnly: z.boolean().default(false),
  minBathrooms: z.number().int().min(1).max(20).nullable().default(null),
  /** All of these, not any: "parking and a water tank" means both. */
  amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length).default([]),
  /**
   * Longest minimum stay the renter will accept. A listing that states no
   * minimum matches, because "not stated" is not a reason to hide it.
   */
  maxMinRentalMonths: z.number().int().min(1).max(60).nullable().default(null),
  /** ISO date the renter needs to move in by. Listings with no date match. */
  availableBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

export type Filters = z.infer<typeof filtersSchema>;

export const EMPTY_FILTERS: Filters = filtersSchema.parse({});

/**
 * Count of filters the user has actually set, for the "Filters (3)" badge.
 *
 * Price counts once, not once per bound — a single range is one decision to the
 * user, and counting it twice makes the badge look wrong.
 */
export function activeFilterCount(f: Filters): number {
  return [
    f.minPrice !== null || f.maxPrice !== null,
    f.district !== null,
    f.sector !== null,
    f.propertyType !== null,
    f.minBedrooms !== null,
    f.furnishedOnly,
    f.minBathrooms !== null,
    f.amenities.length > 0,
    f.maxMinRentalMonths !== null,
    f.availableBy !== null,
  ].filter(Boolean).length;
}

/**
 * The filters in force, as short chips.
 *
 * The chatbot needs to show what it actually searched for: a reply saying "here
 * are furnished studios in Kacyiru" is the model's claim, whereas these chips
 * are read back off the `Filters` object the query really ran with. When the two
 * disagree, the chips are the truth.
 */
export function filterSummary(f: Filters): string[] {
  const chips: string[] = [];

  if (f.minPrice !== null && f.maxPrice !== null) {
    chips.push(`${formatPrice(f.minPrice)} – ${formatPrice(f.maxPrice)}`);
  } else if (f.maxPrice !== null) {
    chips.push(`Under ${formatPrice(f.maxPrice)}`);
  } else if (f.minPrice !== null) {
    chips.push(`From ${formatPrice(f.minPrice)}`);
  }

  if (f.sector) chips.push(f.sector);
  else if (f.district) chips.push(f.district);

  if (f.propertyType) chips.push(PROPERTY_TYPE_LABELS[f.propertyType]);

  if (f.minBedrooms !== null) {
    chips.push(f.minBedrooms === 0 ? 'Studio' : `${f.minBedrooms}+ bedrooms`);
  }

  if (f.furnishedOnly) chips.push('Furnished');

  if (f.minBathrooms !== null) {
    chips.push(`${f.minBathrooms}+ bathroom${f.minBathrooms === 1 ? '' : 's'}`);
  }

  for (const a of f.amenities) chips.push(AMENITY_LABELS[a]);

  if (f.maxMinRentalMonths !== null) {
    chips.push(
      f.maxMinRentalMonths === 1
        ? 'Monthly lease'
        : `Lease ${f.maxMinRentalMonths} months or less`,
    );
  }

  if (f.availableBy !== null) chips.push(`Move in by ${formatShortDate(f.availableBy)}`);

  return chips;
}

/**
 * The short descriptive facts shown on a card, a detail page, and the post
 * review step.
 *
 * Deduplicated on purpose: a studio has property_type 'studio' AND bedrooms 0,
 * and both render as "Studio". Left alone that produced "Studio · Studio" in
 * the UI, and — because the detail page keys its pills by value — a duplicate
 * React key error that took down the whole screen.
 */
export function listingFacts(listing: {
  property_type: PropertyType;
  bedrooms: number | null;
  furnished: boolean;
  bathrooms?: number | null;
}): string[] {
  const bedrooms =
    listing.bedrooms === null
      ? null
      : listing.bedrooms === 0
        ? 'Studio'
        : `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'}`;
  const bathrooms =
    listing.bathrooms == null
      ? null
      : `${listing.bathrooms} bathroom${listing.bathrooms === 1 ? '' : 's'}`;

  return [
    ...new Set(
      [
        PROPERTY_TYPE_LABELS[listing.property_type],
        bedrooms,
        bathrooms,
        listing.furnished ? 'Furnished' : 'Unfurnished',
      ].filter((f): f is string => f !== null),
    ),
  ];
}

/**
 * The rental terms as label/value rows for the detail page and comparison.
 * Unstated terms are listed as "Not stated" rather than dropped, so a missing
 * deposit reads as a question to ask, not as "no deposit".
 */
export function listingTermRows(listing: {
  size_sqm: number | null;
  deposit_rwf: number | null;
  min_rental_months: number | null;
  available_from: string | null;
}): { label: string; value: string }[] {
  const notStated = 'Not stated';
  return [
    {
      label: 'Deposit',
      value: listing.deposit_rwf === null ? notStated : formatPrice(listing.deposit_rwf),
    },
    {
      label: 'Minimum stay',
      value:
        listing.min_rental_months === null
          ? notStated
          : `${listing.min_rental_months} month${listing.min_rental_months === 1 ? '' : 's'}`,
    },
    {
      label: 'Available from',
      value: listing.available_from === null ? 'Now' : formatShortDate(listing.available_from),
    },
    {
      label: 'Size',
      value: listing.size_sqm === null ? notStated : `${listing.size_sqm} m²`,
    },
  ];
}

/** "1 Nov 2026" from an ISO date, read as a calendar day with no timezone shift. */
export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  // Built from parts in UTC and formatted in UTC: `new Date('2026-11-01')` is
  // midnight UTC, which a phone west of Greenwich would render as 31 October.
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Price bounds for the range slider, in RWF, tuned to the Kigali market. */
export const PRICE_BOUNDS = {
  min: 20_000,
  max: 1_000_000,
  step: 10_000,
} as const;
