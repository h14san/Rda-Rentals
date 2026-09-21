import { useMutation } from '@tanstack/react-query';

import { EMPTY_FILTERS, filtersSchema, type Filters } from '@/features/listings/types';
import {
  KIGALI_DISTRICTS,
  SECTORS_BY_DISTRICT,
  type District,
} from '@/lib/locations';
import { messageFromFunctionError } from '@/lib/edge-functions';
import { supabase } from '@/lib/supabase';

/**
 * Natural-language search.
 *
 * The model's only job is to produce a `Filters` object; the existing listings
 * query does the actual searching. Keeping it to that means smart search and
 * the manual filter sheet are the same code path, so anything the AI can
 * express is something the user could also have set by hand — and a bad parse
 * degrades to a normal, inspectable filter rather than a mystery result set.
 */

export interface SmartSearchResult {
  filters: Filters;
  interpretation: string;
  unclear: boolean;
}

/** Every sector the app knows about, flattened for the model's vocabulary. */
const ALL_SECTORS = KIGALI_DISTRICTS.flatMap(
  (d: District) => SECTORS_BY_DISTRICT[d],
);

export function useSmartSearch() {
  return useMutation<SmartSearchResult, Error, string>({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('smart-search', {
        body: {
          query,
          // Sent rather than duplicated server-side so src/lib/locations.ts
          // stays the single source of truth for Kigali place names.
          districts: KIGALI_DISTRICTS,
          sectors: ALL_SECTORS,
        },
      });

      if (error) {
        throw new Error(
          await messageFromFunctionError(error, 'Smart search is unavailable.'),
        );
      }

      // Re-validated here on purpose: the edge function shapes the model's
      // output, but this schema decides what the app will actually accept.
      const parsed = filtersSchema.safeParse(data?.filters);
      if (!parsed.success) {
        throw new Error('Could not understand that search. Try rephrasing it.');
      }

      return {
        filters: parsed.data,
        interpretation:
          typeof data?.interpretation === 'string' ? data.interpretation : '',
        unclear: data?.unclear === true,
      };
    },
  });
}

/** True when a parse produced no usable criteria. */
export function isEmptyResult(result: SmartSearchResult): boolean {
  return (
    result.unclear ||
    JSON.stringify(result.filters) === JSON.stringify(EMPTY_FILTERS)
  );
}
