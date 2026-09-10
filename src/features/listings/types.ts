import { z } from 'zod';

/**
 * Hand-written to match supabase/migrations/20260910120000_init.sql.
 *
 * Once a real project exists, regenerate instead of editing:
 *   npx supabase gen types typescript --project-id <ref> > src/features/listings/types.gen.ts
 * and re-export Database from there. Until then this is the contract.
 */

export const PROPERTY_TYPES = ['studio', 'apartment', 'shared', 'house'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const LISTING_STATUSES = ['draft', 'active', 'rented', 'archived'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  studio: 'Studio',
  apartment: 'Apartment',
  shared: 'Shared',
  house: 'House',
};

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Draft',
  active: 'Live',
  rented: 'Rented',
  archived: 'Archived',
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
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
  address: string | null;
  latitude: number | null;
  longitude: number | null;
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

/** A listing joined with its images, as the feed and detail screens consume it. */
export type ListingWithImages = ListingRow & {
  listing_images: Pick<ListingImageRow, 'id' | 'storage_path' | 'position'>[];
};

/** Detail screen additionally needs the landlord's contact number. */
export type ListingDetail = ListingWithImages & {
  profiles: Pick<ProfileRow, 'id' | 'full_name' | 'whatsapp_phone' | 'phone'> | null;
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
        Insert: Omit<ListingRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Omit<ListingRow, 'id' | 'owner_id'>>;
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
  ].filter(Boolean).length;
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
}): string[] {
  const bedrooms =
    listing.bedrooms === null
      ? null
      : listing.bedrooms === 0
        ? 'Studio'
        : `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'}`;

  return [
    ...new Set(
      [
        PROPERTY_TYPE_LABELS[listing.property_type],
        bedrooms,
        listing.furnished ? 'Furnished' : 'Unfurnished',
      ].filter((f): f is string => f !== null),
    ),
  ];
}

/** Price bounds for the range slider, in RWF, tuned to the Kigali market. */
export const PRICE_BOUNDS = {
  min: 20_000,
  max: 1_000_000,
  step: 10_000,
} as const;
