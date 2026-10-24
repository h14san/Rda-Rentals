/**
 * Amenities a landlord can tick, and a renter can filter on.
 *
 * A bundled constant for the same reasons as locations.ts: short, static, and
 * needed offline. It is also the vocabulary the AI search functions are given,
 * so "with parking and a water tank" can only map to keys that exist here.
 *
 * These are landlord-declared facts, shown as such. They are not something the
 * auto-describe prompt may infer from a photo, which is why that prompt still
 * forbids utility and security claims.
 */

export const AMENITIES = [
  'water_tank',
  'backup_power',
  'hot_water',
  'parking',
  'security',
  'fenced',
  'wifi',
  'balcony',
  'garden',
  'pets_allowed',
] as const;

export type Amenity = (typeof AMENITIES)[number];

export const AMENITY_LABELS: Record<Amenity, string> = {
  water_tank: 'Water tank',
  backup_power: 'Backup power',
  hot_water: 'Hot water',
  parking: 'Parking',
  security: 'Security guard',
  fenced: 'Fenced compound',
  wifi: 'Wi-Fi',
  balcony: 'Balcony',
  garden: 'Garden',
  pets_allowed: 'Pets allowed',
};

/** Drops keys the app does not know, so a stale or hand-edited row cannot crash a label lookup. */
export function knownAmenities(
  values: readonly string[] | null | undefined,
): Amenity[] {
  return (values ?? []).filter((v): v is Amenity =>
    (AMENITIES as readonly string[]).includes(v),
  );
}
