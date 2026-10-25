import { z } from 'zod';

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
};

/**
 * Where a draft goes when the landlord presses Publish.
 *
 * 'published' until landlord verification exists (Phase 3). The trigger is
 * what actually enforces this; flipping it here without the trigger change
 * would leave the button asking for a move the database refuses.
 */
export const PUBLISH_TARGET: ListingStatus = 'published';

/** The status changes a landlord is offered, per current status. */
export const LANDLORD_STATUS_ACTIONS: Partial<
  Record<ListingStatus, { to: ListingStatus; label: string }[]>
> = {
  draft: [{ to: PUBLISH_TARGET, label: 'Publish' }],
  published: [
    { to: 'rented', label: 'Mark rented' },
    { to: 'paused', label: 'Pause' },
  ],
  paused: [{ to: 'published', label: 'Republish' }],
  unavailable: [{ to: 'published', label: 'Republish' }],
  rented: [{ to: 'published', label: 'Available again' }],
  rejected: [{ to: 'draft', label: 'Back to draft' }],
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
  whatsapp_phone: string | null;
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
};

/** Detail screen additionally needs the landlord's contact number. */
export type ListingDetail = ListingWithImages & {
  profiles: Pick<ProfileRow, 'id' | 'full_name' | 'whatsapp_phone'> | null;
  listing_locations: Pick<ListingLocationRow, 'address' | 'latitude' | 'longitude'> | null;
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
          | 'availability_confirmed_at'
          | 'bathrooms'
          | 'size_sqm'
          | 'deposit_rwf'
          | 'min_rental_months'
          | 'available_from'
          | 'amenities'
        > &
          Partial<
            Pick<
              ListingRow,
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
          Omit<ListingRow, 'id' | 'owner_id' | 'approx_latitude' | 'approx_longitude'>
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/**
 * Feed filters.
 *
 * This shape is deliberately the single description of "what can be searched".
 * Phase 3's natural-language parser targets this object rather than building
 * its own query, so anything the AI can express is already expressible here.
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
