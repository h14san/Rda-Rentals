import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { SortOrder } from '@/features/listings/queries';
import { EMPTY_FILTERS, type Filters } from '@/features/listings/types';

/**
 * Feed filters live above both the feed and the filters modal, which are
 * separate routes and so cannot share local state.
 *
 * Phase 3's natural-language search sets this same object — "a cheap studio
 * near Kimironko under 150,000" becomes a Filters value — so the AI path and
 * the manual path stay one code path.
 */
interface FiltersState {
  filters: Filters;
  setFilters: (next: Filters) => void;
  resetFilters: () => void;
  // Sort lives alongside filters rather than inside them: Filters is the shape
  // Phase 3's natural-language parser targets, and it should describe what to
  // match, not how to order the result.
  sort: SortOrder;
  setSort: (next: SortOrder) => void;
}

const FiltersContext = createContext<FiltersState | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortOrder>('newest');

  const value = useMemo<FiltersState>(
    () => ({
      filters,
      setFilters,
      resetFilters: () => setFilters(EMPTY_FILTERS),
      sort,
      setSort,
    }),
    [filters, sort],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersState {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used inside <FiltersProvider>.');
  return ctx;
}
