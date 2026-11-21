/**
 * Filters: the one shape every search path (filter sheet, search bar, AI)
 * produces. The app re-validates AI output with filtersSchema, so this schema
 * is the last word on what a search can contain.
 */
import {
  activeFilterCount,
  EMPTY_FILTERS,
  filterSummary,
  filtersSchema,
  type Filters,
} from '@/features/listings/types';
import { setActiveLanguage } from '@/lib/i18n-state';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const with_ = (f: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...f });

beforeEach(() => setActiveLanguage('en'));

describe('filtersSchema', () => {
  it('fills every field with "no filter" by default', () => {
    expect(EMPTY_FILTERS).toEqual({
      minPrice: null,
      maxPrice: null,
      district: null,
      sector: null,
      propertyType: null,
      minBedrooms: null,
      furnishedOnly: false,
      minBathrooms: null,
      amenities: [],
      maxMinRentalMonths: null,
      availableBy: null,
    });
  });

  it.each([
    ['a negative price', { minPrice: -1 }],
    ['a fractional price', { maxPrice: 150000.5 }],
    ['an unknown property type', { propertyType: 'castle' }],
    ['an amenity that does not exist', { amenities: ['pool'] }],
    ['a move-in date in another format', { availableBy: '21/11/2026' }],
    ['a lease longer than 60 months', { maxMinRentalMonths: 61 }],
  ])('rejects %s (bad AI output must not reach the query)', (_label, input) => {
    expect(filtersSchema.safeParse(input).success).toBe(false);
  });
});

describe('activeFilterCount', () => {
  it('is zero with nothing set', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('counts a price range once, not once per bound', () => {
    expect(activeFilterCount(with_({ minPrice: 100000, maxPrice: 300000 }))).toBe(1);
  });

  it('counts each other filter', () => {
    const f = with_({ sector: 'Kimironko', furnishedOnly: true, amenities: ['wifi', 'parking'] });
    expect(activeFilterCount(f)).toBe(3);
  });
});

describe('filterSummary (the chips read back off what was searched)', () => {
  it('is empty with nothing set', () => {
    expect(filterSummary(EMPTY_FILTERS)).toEqual([]);
  });

  it('shows the price as one range', () => {
    expect(filterSummary(with_({ minPrice: 100000, maxPrice: 300000 }))).toEqual([
      '100,000 RWF – 300,000 RWF',
    ]);
    expect(filterSummary(with_({ maxPrice: 200000 }))).toEqual(['Under 200,000 RWF']);
  });

  it('names the sector rather than both sector and district', () => {
    expect(filterSummary(with_({ district: 'Gasabo', sector: 'Kimironko' }))).toEqual(['Kimironko']);
  });

  it('shows a studio as "Studio", not "0+ bedrooms"', () => {
    expect(filterSummary(with_({ minBedrooms: 0 }))).toEqual(['Studio']);
  });

  it('speaks French when French is chosen', () => {
    setActiveLanguage('fr');
    expect(filterSummary(with_({ maxPrice: 200000, minBedrooms: 2 }))).toEqual([
      'Moins de 200,000 RWF',
      '2+ chambres',
    ]);
  });
});
