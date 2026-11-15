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

import { ActionSheet } from '@/components/action-sheet';
import { FeedMap } from '@/components/feed-map';
import { ListingCard } from '@/components/listing-card';
import { EmptyState, ErrorState, ListingCardSkeleton } from '@/components/states';
import { useAuth } from '@/features/auth/context';
import { useFavoriteControl } from '@/features/listings/favorites';
import { useFilters } from '@/features/listings/filters-context';
import {
  SORT_LABELS,
  useListingsFeed,
  type SortOrder,
} from '@/features/listings/queries';
import { isEmptyResult, useSmartSearch } from '@/features/listings/smart-search';
import { activeFilterCount, filterSummary } from '@/features/listings/types';
import { colors, fontFamily, radius, shadow, spacing, type } from '@/theme';

const SORT_OPTIONS: SortOrder[] = ['newest', 'price_asc', 'price_desc', 'confirmed'];

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
  const [view, setView] = useState<'list' | 'map'>('list');
  const [sortOpen, setSortOpen] = useState(false);
  const smartSearch = useSmartSearch();
  const { session } = useAuth();
  const favorites = useFavoriteControl(session?.user.id ?? null);

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
  // Read back off the Filters object the query ran with, so what is shown is
  // what was searched, whichever path set it.
  const chips = filterSummary(filters);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.searchLine}>
          {/* One raised pill, the way a search bar reads on every phone. The
              text in it is the quick way to filter: type what you want and the
              filters are set for you. */}
          <View style={styles.searchPill}>
            <Ionicons name="sparkles-outline" size={18} color={colors.softBlack} />
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Try: cheap studio near Kimironko"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              onSubmitEditing={runSmartSearch}
              editable={!smartSearch.isPending}
              accessibilityLabel="Search rentals in your own words"
            />
            {smartSearch.isPending ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : searchText.length > 0 ? (
              <Pressable
                onPress={clearSearch}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'
            }
            onPress={() => router.push('/filters')}
            style={({ pressed }) => [
              styles.filterButton,
              filterCount > 0 && styles.filterButtonActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="options-outline" size={20} color={colors.softBlack} />
            {filterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{filterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {!!interpretation && (
          <Text style={styles.interpretation} numberOfLines={2}>
            {interpretation}
          </Text>
        )}

        {chips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeRow}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              onPress={clearSearch}
              style={[styles.activeChip, styles.clearChip]}
            >
              <Ionicons name="close" size={14} color={colors.white} />
              <Text style={[styles.activeChipText, styles.clearChipText]}>Clear</Text>
            </Pressable>
            {chips.map((chip) => (
              <View key={chip} style={styles.activeChip}>
                <Text style={styles.activeChipText}>{chip}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {!isPending && !isError && (
          <View style={styles.resultRow}>
            <Text style={styles.resultCount}>
              {total === 0 ? 'No rentals' : `${total} rental${total === 1 ? '' : 's'}`}
            </Text>

            <View style={styles.resultActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sort: ${SORT_LABELS[sort]}. Opens the sort options.`}
                onPress={() => setSortOpen(true)}
                style={({ pressed }) => [styles.pillButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.pillLabel}>{SORT_LABELS[sort]}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.charcoal} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={view === 'list' ? 'Show on a map' : 'Show as a list'}
                onPress={() => setView(view === 'list' ? 'map' : 'list')}
                style={({ pressed }) => [styles.pillButton, pressed && { opacity: 0.7 }]}
              >
                <Ionicons
                  name={view === 'list' ? 'map-outline' : 'list-outline'}
                  size={15}
                  color={colors.charcoal}
                />
                <Text style={styles.pillLabel}>{view === 'list' ? 'Map' : 'List'}</Text>
              </Pressable>
            </View>
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
          onAction={filterCount > 0 ? clearSearch : undefined}
        />
      ) : view === 'map' ? (
        <FeedMap
          listings={listings}
          total={total}
          hasMore={!!hasNextPage}
          loadingMore={isFetchingNextPage}
          onLoadMore={() => void fetchNextPage()}
          onOpen={(id) => router.push(`/listing/${id}`)}
        />
      ) : (
        <FlashList
          data={listings}
          keyExtractor={(item) => item.id}
          extraData={favorites.savedIds}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push(`/listing/${item.id}`)}
              favorite={
                item.owner_id === session?.user.id
                  ? undefined
                  : favorites.propsFor(item.id)
              }
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

      {/* A list to choose from, not a button that cycles: the order someone
          wants should be one deliberate tap away, not up to three blind ones. */}
      <ActionSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Sort by"
        actions={SORT_OPTIONS.map((option) => ({
          label: SORT_LABELS[option],
          selected: sort === option,
          onPress: () => setSort(option),
        }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 4,
    gap: spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow,
  },
  searchInput: { flex: 1, ...type.body, paddingVertical: 0 },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterButtonActive: { borderColor: colors.softBlack, borderWidth: 1.5 },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softBlack,
  },
  filterBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.white,
  },
  interpretation: {
    ...type.meta,
    color: colors.charcoal,
    paddingHorizontal: spacing.md,
  },
  activeRow: { paddingHorizontal: spacing.md, gap: spacing.sm },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
  },
  activeChipText: type.label,
  clearChip: { backgroundColor: colors.softBlack },
  clearChipText: { color: colors.white },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  resultCount: type.bodyStrong,
  resultActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  pillLabel: type.label,
  listContent: { padding: spacing.md },
  listPadding: { padding: spacing.md },
  footer: { paddingVertical: spacing.lg },
});
