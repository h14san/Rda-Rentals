/**
 * Kigali administrative divisions, used by the filter and post-listing pickers.
 *
 * Held in the bundle rather than a table: the list is short, effectively static,
 * and needing it offline (or before the first query resolves) is the common
 * case. Phase 2 nationwide expansion is when this earns a database table.
 */

export const KIGALI_DISTRICTS = ['Gasabo', 'Kicukiro', 'Nyarugenge'] as const;

export type District = (typeof KIGALI_DISTRICTS)[number];

export const SECTORS_BY_DISTRICT: Record<District, readonly string[]> = {
  Gasabo: [
    'Bumbogo', 'Gatsata', 'Gikomero', 'Gisozi', 'Jabana', 'Jali', 'Kacyiru',
    'Kimihurura', 'Kimironko', 'Kinyinya', 'Ndera', 'Nduba', 'Remera',
    'Rusororo', 'Rutunga',
  ],
  Kicukiro: [
    'Gahanga', 'Gatenga', 'Gikondo', 'Kagarama', 'Kanombe', 'Kicukiro',
    'Kigarama', 'Masaka', 'Niboye', 'Nyarugunga',
  ],
  Nyarugenge: [
    'Gitega', 'Kanyinya', 'Kigali', 'Kimisagara', 'Mageragere', 'Muhima',
    'Nyakabanda', 'Nyamirambo', 'Nyarugenge', 'Rwezamenyo',
  ],
} as const;

/** The brief's launch neighbourhoods, surfaced as quick chips on the feed. */
export const LAUNCH_SECTORS = [
  'Kimironko',
  'Nyamirambo',
  'Kacyiru',
  'Remera',
  'Gisozi',
] as const;

/** Map camera default. Kigali city centre. */
export const KIGALI_CENTER = {
  latitude: -1.9441,
  longitude: 30.0619,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
} as const;

export function sectorsFor(district: string | null | undefined): readonly string[] {
  if (!district) return [];
  return SECTORS_BY_DISTRICT[district as District] ?? [];
}

/** Reverse lookup, for showing a sector's district without a second picker. */
export function districtForSector(sector: string): District | undefined {
  return KIGALI_DISTRICTS.find((d) => SECTORS_BY_DISTRICT[d].includes(sector));
}
