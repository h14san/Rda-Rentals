/**
 * The search request itself.
 *
 * useListingsFeed runs against a real supabase-js client whose fetch is
 * replaced by a recorder, so these tests read the exact PostgREST request the
 * app would send. RLS is still the real boundary (db:rls-check covers it);
 * this pins what the app asks for, which is where "unstated terms match" and
 * "only published listings" are expressed.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { PAGE_SIZE, useListingsFeed } from '@/features/listings/queries';
import { EMPTY_FILTERS, type Filters } from '@/features/listings/types';

const mockRequests: URL[] = [];

jest.mock('@/lib/supabase', () => {
  const { createClient } = jest.requireActual('@supabase/supabase-js');
  const recordingFetch = async (input: string | URL) => {
    mockRequests.push(new URL(String(input)));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-range', '0-0/0']]),
      text: async () => '[]',
      json: async () => [],
    };
  };
  return {
    supabase: createClient('http://supabase.test', 'anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: recordingFetch },
    }),
    imageUrl: (path: string) => path,
  };
});

type Sort = Parameters<typeof useListingsFeed>[1];
type Bounds = Parameters<typeof useListingsFeed>[3];

async function requestFor(
  filters: Partial<Filters> = {},
  sort: Sort = 'newest',
  bounds: Bounds = null,
): Promise<URL> {
  mockRequests.length = 0;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // Testing Library 14 renders asynchronously; renderHook must be awaited.
  const { result, unmount } = await renderHook(
    () => useListingsFeed({ ...EMPTY_FILTERS, ...filters }, sort, true, bounds),
    { wrapper },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await unmount();
  client.clear();
  expect(mockRequests).toHaveLength(1);
  return mockRequests[0];
}

const params = (url: URL, key: string) => url.searchParams.getAll(key);

describe('the feed request', () => {
  it('reads listings, and only published ones', async () => {
    const url = await requestFor();
    expect(url.pathname).toBe('/rest/v1/listings');
    expect(params(url, 'status')).toEqual(['eq.published']);
  });

  it('never asks for the exact location (rules 3 and 4)', async () => {
    const url = await requestFor({ sector: 'Kimironko' });
    expect(url.toString()).not.toContain('listing_locations');
    expect(url.searchParams.get('select')).not.toMatch(/address|latitude|longitude/);
  });

  it('sends nothing but the status when no filter is set', async () => {
    const url = await requestFor();
    const filterKeys = [...url.searchParams.keys()].filter(
      (k) => !['select', 'order', 'offset', 'limit'].includes(k),
    );
    expect(filterKeys).toEqual(['status']);
  });

  it('applies price bounds and the place', async () => {
    const url = await requestFor({
      minPrice: 100000,
      maxPrice: 300000,
      district: 'Gasabo',
      sector: 'Kimironko',
    });
    expect(params(url, 'price_rwf')).toEqual(['gte.100000', 'lte.300000']);
    expect(params(url, 'district')).toEqual(['eq.Gasabo']);
    expect(params(url, 'sector')).toEqual(['eq.Kimironko']);
  });

  it('applies type, rooms and furnished', async () => {
    const url = await requestFor({
      propertyType: 'apartment',
      minBedrooms: 2,
      minBathrooms: 1,
      furnishedOnly: true,
    });
    expect(params(url, 'property_type')).toEqual(['eq.apartment']);
    expect(params(url, 'bedrooms')).toEqual(['gte.2']);
    expect(params(url, 'bathrooms')).toEqual(['gte.1']);
    expect(params(url, 'furnished')).toEqual(['eq.true']);
  });

  it('requires every chosen amenity, not any of them', async () => {
    const url = await requestFor({ amenities: ['wifi', 'parking'] });
    expect(params(url, 'amenities')).toEqual(['cs.{wifi,parking}']);
  });

  it('lets a listing with unstated terms match (a blank is not a "no")', async () => {
    const url = await requestFor({ maxMinRentalMonths: 6, availableBy: '2027-01-01' });
    expect(params(url, 'or')).toEqual([
      '(min_rental_months.is.null,min_rental_months.lte.6)',
      '(available_from.is.null,available_from.lte.2027-01-01)',
    ]);
  });

  it('searches the area on the map by the approximate point', async () => {
    const url = await requestFor({}, 'newest', {
      south: -1.98,
      north: -1.9,
      west: 30.03,
      east: 30.13,
    });
    expect(params(url, 'approx_latitude')).toEqual(['gte.-1.98', 'lte.-1.9']);
    expect(params(url, 'approx_longitude')).toEqual(['gte.30.03', 'lte.30.13']);
  });

  it('asks for one page at a time', async () => {
    const url = await requestFor();
    expect(url.searchParams.get('offset')).toBe('0');
    expect(url.searchParams.get('limit')).toBe(String(PAGE_SIZE));
  });
});

describe('sorting', () => {
  it.each<[Sort, string]>([
    ['newest', 'created_at.desc'],
    ['price_asc', 'price_rwf.asc'],
    ['price_desc', 'price_rwf.desc'],
    ['confirmed', 'availability_confirmed_at.desc.nullslast'],
  ])('%s orders by %s', async (sort, order) => {
    const url = await requestFor({}, sort);
    expect(url.searchParams.get('order')).toBe(order);
  });

  // Paid placement is not a product yet, and an explicit sort must never be
  // overridden by it.
  it('never orders by is_featured', async () => {
    for (const sort of ['newest', 'price_asc', 'price_desc', 'confirmed'] as Sort[]) {
      const url = await requestFor({}, sort);
      expect(url.searchParams.get('order')).not.toContain('is_featured');
    }
  });
});
