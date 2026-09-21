// The filter contract both AI entry points target.
//
// `Filters` in src/features/listings/types.ts is the app's single description of
// what can be searched. Smart search and the chatbot both emit that shape and
// hand it to the ordinary listings query, so anything a model returns is
// something the renter could also have set by hand in the filter sheet — and a
// bad parse degrades to an inspectable filter rather than a mystery result set.
//
// This module is the one server-side description of that contract: the response
// schema fragment, the sentinel decoding, and the vocabulary rules. Two copies
// of the Kigali place-name rules would have been two chances to let a model
// invent a sector.

import { Type } from 'npm:@google/genai@2.21.0';

export const PROPERTY_TYPES = ['studio', 'apartment', 'shared', 'house'] as const;

/**
 * Sentinels instead of nulls.
 *
 * Gemini's response schema supports `nullable`, but combining it with `enum` and
 * required fields is where structured output gets flaky across models. It is
 * more robust to demand every field, use an out-of-band value for "not
 * specified", and convert to null here. Note -1 for bedrooms: 0 is a *real*
 * value meaning studio, so it cannot double as the sentinel.
 */
export const UNSET_NUMBER = 0;
export const UNSET_BEDROOMS = -1;
export const UNSET_TYPE = 'any';

/** The filter half of a response schema, spread into each function's own. */
export const filterSchemaProperties = {
  minPrice: {
    type: Type.INTEGER,
    description: 'Minimum monthly rent in RWF, or 0 if not specified.',
  },
  maxPrice: {
    type: Type.INTEGER,
    description: 'Maximum monthly rent in RWF, or 0 if not specified.',
  },
  district: {
    type: Type.STRING,
    description: 'Exact district name from the allowed list, or empty string.',
  },
  sector: {
    type: Type.STRING,
    description: 'Exact sector name from the allowed list, or empty string.',
  },
  propertyType: { type: Type.STRING, enum: [UNSET_TYPE, ...PROPERTY_TYPES] },
  minBedrooms: {
    type: Type.INTEGER,
    description: 'Minimum bedrooms; 0 means studio, -1 if not specified.',
  },
  furnishedOnly: { type: Type.BOOLEAN },
};

/** Every filter field is required; "not specified" is carried by the sentinels. */
export const FILTER_FIELDS = Object.keys(filterSchemaProperties);

export interface FilterOutput {
  minPrice: number;
  maxPrice: number;
  district: string;
  sector: string;
  propertyType: string;
  minBedrooms: number;
  furnishedOnly: boolean;
}

/**
 * Converts sentinels to nulls and drops anything outside the allowed
 * vocabulary. The prompt tells the model not to invent places; this makes it
 * true regardless of whether it complied.
 */
export function toFilters(
  out: FilterOutput,
  districts: string[],
  sectors: string[],
) {
  const positive = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) && n > UNSET_NUMBER
      ? Math.round(n)
      : null;

  const inList = (value: string, list: string[]) =>
    list.find((v) => v.toLowerCase() === value.trim().toLowerCase()) ?? null;

  return {
    minPrice: positive(out.minPrice),
    maxPrice: positive(out.maxPrice),
    district: out.district ? inList(out.district, districts) : null,
    sector: out.sector ? inList(out.sector, sectors) : null,
    propertyType:
      out.propertyType &&
      out.propertyType !== UNSET_TYPE &&
      (PROPERTY_TYPES as readonly string[]).includes(out.propertyType)
        ? out.propertyType
        : null,
    minBedrooms:
      typeof out.minBedrooms === 'number' && out.minBedrooms > UNSET_BEDROOMS
        ? Math.round(out.minBedrooms)
        : null,
    furnishedOnly: out.furnishedOnly === true,
  };
}

/**
 * How to fill the filter fields. Shared so the two entry points cannot disagree
 * about what "cheap" means or which sectors exist.
 *
 * The place names arrive from the app (src/lib/locations.ts) rather than being
 * duplicated here, so the vocabulary the model is allowed to use has one source
 * of truth.
 */
export function filterRules(districts: string[], sectors: string[]): string[] {
  return [
    '- Only fill a field the user actually implied. Use the "not specified"',
    '  value for everything else: 0 for prices, "" for district and sector,',
    `  "${UNSET_TYPE}" for propertyType, ${UNSET_BEDROOMS} for minBedrooms.`,
    '- Never invent a location. district must be one of: ' + districts.join(', ') + '.',
    '- sector must be one of: ' + sectors.join(', ') + '.',
    '- If a place is named that is not in those lists — a landmark, a school, a',
    '  church, a neighbourhood nickname — leave both empty and say so rather',
    '  than guessing a nearby sector. A wrong area wastes a trip across Kigali.',
    '- "studio" sets propertyType to studio, not minBedrooms 0.',
    '- Vague budget words map to ranges a Kigali renter would expect:',
    '  "cheap"/"affordable"/"budget" -> maxPrice 150000;',
    '  "mid-range" -> minPrice 150000 and maxPrice 400000;',
    '  "luxury"/"executive" -> minPrice 500000.',
    '- "under X" sets maxPrice X. "from X"/"at least X" sets minPrice X.',
    '- Handle typos and local spellings ("apratment" -> apartment,',
    '  "Kimirongo" -> Kimironko).',
    '- Treat a bare number above 20000 as a monthly budget ceiling.',
  ];
}
