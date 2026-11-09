import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Chip } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import type { CaseSubject } from '@/features/listings/types';
import { useReviewQueue } from '@/features/verification/queries';
import { CASE_STATUS_LABELS } from '@/features/verification/types';
import { formatLocation, timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Staff review queue, oldest first.
 *
 * Hidden from non-staff here, but this is only presentation: RLS returns no
 * cases to anyone without a staff role, and every decision is re-checked by
 * decide_verification.
 */
export default function ReviewQueueScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();
  const [subject, setSubject] = useState<CaseSubject | null>(null);
  const queue = useReviewQueue(isStaff);

  if (!isStaff) {
    return (
      <EmptyState
        title="Staff only"
        message="The review queue is for Rwanda Rentals verification staff."
      />
    );
  }
  if (queue.isPending) return <LoadingState label="Loading the queue…" />;
  if (queue.isError)
    return <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />;

  const items = subject ? queue.data.filter((c) => c.subject_type === subject) : queue.data;

  return (
    <FlatList
      data={items}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={queue.isRefetching} onRefresh={() => void queue.refetch()} />
      }
      ListHeaderComponent={
        <View style={styles.filters}>
          <Chip label="All" selected={subject === null} onPress={() => setSubject(null)} />
          <Chip
            label="Landlords"
            selected={subject === 'landlord'}
            onPress={() => setSubject('landlord')}
          />
          <Chip
            label="Listings"
            selected={subject === 'listing'}
            onPress={() => setSubject('listing')}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState title="Nothing to review" message="New submissions will appear here." />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/review/${item.id}`)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.kind}>
            {item.subject_type === 'landlord' ? 'Landlord ID' : 'Listing'}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {item.subject_type === 'listing'
              ? (item.listings?.title ?? 'Deleted listing')
              : (item.owner?.full_name ?? 'Unnamed landlord')}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[
              item.subject_type === 'listing' && item.listings
                ? formatLocation(item.listings.sector, item.listings.district)
                : null,
              item.subject_type === 'listing' ? `by ${item.owner?.full_name ?? 'unknown'}` : null,
              `${CASE_STATUS_LABELS[item.status]} · sent ${timeAgo(item.submitted_at)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  row: {
    gap: 2,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  kind: type.caption,
  title: type.bodyStrong,
  meta: type.meta,
});
