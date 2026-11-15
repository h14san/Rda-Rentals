import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { StaffOnly, StaffRow } from '@/components/staff';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Chip, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
  type ListingStatus,
} from '@/features/listings/types';
import { useStaffListings } from '@/features/staff/queries';
import { formatLocation, formatPrice } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { spacing } from '@/theme';

/**
 * Every listing in every status, by title.
 *
 * Its own query on purpose. "Nothing builds its own listings query" is a rule
 * for the public search paths, which must all go through Filters. This is not
 * one of them: it shows drafts and suspended listings, to staff only.
 */
export default function StaffListingsScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ListingStatus | null>(null);
  const search = useDebounced(q);
  const listings = useStaffListings(search, status, isStaff);

  if (!isStaff) return <StaffOnly />;

  return (
    <FlatList
      data={listings.data ?? []}
      keyExtractor={(l) => l.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <TextField
            label="Search by title"
            value={q}
            onChangeText={setQ}
            placeholder="Part of a listing's title"
            autoCorrect={false}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              <Chip label="Any status" selected={status === null} onPress={() => setStatus(null)} />
              {LISTING_STATUSES.map((s) => (
                <Chip
                  key={s}
                  label={LISTING_STATUS_LABELS[s]}
                  selected={status === s}
                  onPress={() => setStatus(s)}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        listings.isPending ? (
          <LoadingState label="Searching…" />
        ) : listings.isError ? (
          <ErrorState error={listings.error} onRetry={() => void listings.refetch()} />
        ) : (
          <EmptyState title="No listings found" message="Try another title or status." />
        )
      }
      renderItem={({ item }) => (
        <StaffRow
          caption={LISTING_STATUS_LABELS[item.status]}
          title={item.title}
          meta={[
            formatPrice(item.price_rwf),
            formatLocation(item.sector, item.district),
            `by ${item.owner?.full_name ?? 'unknown'}`,
          ].join(' · ')}
          onPress={() => router.push(`/staff/listings/${item.id}`)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
});
