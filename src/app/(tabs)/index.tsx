import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListingCard } from '@/components/listing-card';
import { EmptyState, ErrorState, ListingCardSkeleton } from '@/components/states';
import { Chip } from '@/components/ui';
import { useFilters } from '@/features/listings/filters-context';
import {
  SORT_LABELS,
  useListingsFeed,
  type SortOrder,
} from '@/features/listings/queries';
import { isEmptyResult, useSmartSearch } from '@/features/listings/smart-search';
import { activeFilterCount } from '@/features/listings/types';
import { LAUNCH_SECTORS, districtForSector } from '@/lib/locations';
import { colors, radius, spacing, type } from '@/theme';

const SORT_CYCLE: SortOrder[] = ['newest', 'price_asc', 'price_desc'];

/** Tap cycles the ordering — three options do not justify a modal picker. */
function nextSort(current: SortOrder): SortOrder {
  return SORT_CYCLE[(SORT_CYCLE.indexOf(current) + 1) % SORT_CYCLE.length];
}

export default function FeedScreen() {
  const router = useRouter();
  const {
    filters,
    setFilters,
    resetFilters,
    sort,
    setSort,
    interpretation,
    setInterpretation,
  } = useFilters();

  const [searchText, setSearchText] = useState('');
  const smartSearch = useSmartSearch();

  function runSmartSearch() {
    const query = searchText.trim();
    if (!query || smartSearch.isPending) return;

    smartSearch.mutate(query, {
      onSuccess: (result) => {
        if (isEmptyResult(result)) {
          // Applying an all-null filter would silently reset the feed and look
          // like the search did nothing.
          Alert.alert(
            'No filters found',
            'Try naming a price, area, or property type — for example "2 bedroom in Remera under 300,000".',
          );
          return;
        }
        setFilters(result.filters);
        setInterpretation(result.interpretation || null);
      },
      onError: (error) => Alert.alert('Search failed', error.message),
    });
  }

  function clearSearch() {
    setSearchText('');
    resetFilters();
  }

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useListingsFeed(filters, sort);

  const listings = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const filterCount = activeFilterCount(filters);

  /** Quick sector chips act as a shortcut into the same filter object. */
  function toggleSector(sector: string) {
    setFilters(
      filters.sector === sector
        ? { ...filters, sector: null, district: null }
        : { ...filters, sector, district: districtForSector(sector) ?? null },
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Find a rental</Text>
            <Text style={styles.subtitle}>Kigali</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'
            }
            onPress={() => router.push('/filters')}
            style={({ pressed }) => [styles.filterButton, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="options-outline" size={18} color={colors.softBlack} />
            <Text style={styles.filterLabel}>
              Filters{filterCount > 0 ? ` (${filterCount})` : ''}
            </Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="sparkles-outline" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Try: cheap studio near Kimironko"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            onSubmitEditing={runSmartSearch}
            editable={!smartSearch.isPending}
          />
          {smartSearch.isPending ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : searchText.length > 0 ? (
            <Pressable
              onPress={clearSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {!!interpretation && (
          <View style={styles.interpretation}>
            <Text style={styles.interpretationText} numberOfLines={2}>
              {interpretation}
            </Text>
            <Pressable
              onPress={clearSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear smart search"
            >
              <Text style={styles.clearLink}>Clear</Text>
            </Pressable>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {LAUNCH_SECTORS.map((sector) => (
            <Chip
              key={sector}
              label={sector}
              selected={filters.sector === sector}
              onPress={() => toggleSector(sector)}
            />
          ))}
        </ScrollView>

        {!isPending && !isError && (
          <View style={styles.resultRow}>
            <Text style={styles.resultCount}>
              {total === 0 ? 'No rentals' : `${total} rental${total === 1 ? '' : 's'}`}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort: ${SORT_LABELS[sort]}. Tap to change.`}
              onPress={() => setSort(nextSort(sort))}
              style={({ pressed }) => [styles.sortButton, pressed && { opacity: 0.7 }]}
            >
              <Ionicons
                name="swap-vertical-outline"
                size={16}
                color={colors.charcoal}
              />
              <Text style={styles.sortLabel}>{SORT_LABELS[sort]}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {isPending ? (
        <View style={styles.listPadding}>
          <ListingCardSkeleton />
          <ListingCardSkeleton />
          <ListingCardSkeleton />
        </View>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : listings.length === 0 ? (
        <EmptyState
          title="No rentals match"
          message={
            filterCount > 0
              ? 'Try widening your price range or clearing a filter.'
              : 'There are no live listings yet. Be the first to post one.'
          }
          actionLabel={filterCount > 0 ? 'Clear filters' : undefined}
          onAction={filterCount > 0 ? resetFilters : undefined}
        />
      ) : (
        <FlashList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          onRefresh={() => void refetch()}
          refreshing={isRefetching}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={styles.footer} color={colors.muted} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  title: type.h1,
  subtitle: type.meta,
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  filterLabel: type.label,
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
  },
  searchInput: { flex: 1, ...type.body, paddingVertical: 0 },
  interpretation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  interpretationText: { ...type.meta, flex: 1, color: colors.charcoal },
  clearLink: type.label,
  chipRow: { paddingHorizontal: spacing.md, gap: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  resultCount: type.meta,
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sortLabel: type.label,
  listContent: { padding: spacing.md },
  listPadding: { padding: spacing.md },
  footer: { paddingVertical: spacing.lg },
});
