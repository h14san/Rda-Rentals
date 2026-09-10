import { useMutation } from '@tanstack/react-query';

import { EMPTY_FILTERS, filtersSchema, type Filters } from '@/features/listings/types';
import {
  KIGALI_DISTRICTS,
  SECTORS_BY_DISTRICT,
  type District,
} from '@/lib/locations';
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

/**
 * Pulls the message out of a failed function call.
 *
 * supabase-js surfaces a non-2xx response as an error whose body has not been
 * read yet, so the useful text is behind `context`. Without this every failure
 * reads "Edge Function returned a non-2xx status code", which tells the user
 * nothing about whether to retry, rephrase, or give up.
 */
async function messageFromError(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Fall through to the generic message below.
    }
  }
  return error instanceof Error ? error.message : 'Smart search is unavailable.';
}

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

      if (error) throw new Error(await messageFromError(error));

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
