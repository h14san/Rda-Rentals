import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BookingCard } from '@/components/booking-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, Chip } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useMyBookings } from '@/features/bookings/queries';
import { isActiveBooking } from '@/features/bookings/types';
import { useStartConversation } from '@/features/messaging/queries';
import { spacing } from '@/theme';

type Side = 'renting' | 'hosting';

/**
 * The caller's bookings, both as a renter and as a landlord. One screen with a
 * switch, because one account can be both.
 */
export default function BookingsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;
  const bookings = useMyBookings(userId);
  const [chosen, setChosen] = useState<Side | null>(null);
  const openChat = useStartConversation();

  if (!userId) return null;
  if (bookings.isPending) return <LoadingState label="Loading your bookings…" />;
  if (bookings.isError)
    return <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />;

  const hosting = bookings.data.filter((b) => b.landlord_id === userId);
  const renting = bookings.data.filter((b) => b.renter_id === userId);
  // Open on whichever side has something waiting for this person to do.
  const side: Side =
    chosen ?? (hosting.some((b) => b.status === 'requested') ? 'hosting' : 'renting');
  const items = (side === 'hosting' ? hosting : renting)
    .slice()
    // Live bookings first; within each group the query's newest-first holds.
    .sort((a, b) => Number(isActiveBooking(b.status)) - Number(isActiveBooking(a.status)));

  return (
    <FlatList
      data={items}
      keyExtractor={(b) => b.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={bookings.isRefetching}
          onRefresh={() => void bookings.refetch()}
        />
      }
      ListHeaderComponent={
        <View style={styles.filters}>
          <Chip
            label={`Places I am booking (${renting.length})`}
            selected={side === 'renting'}
            onPress={() => setChosen('renting')}
          />
          <Chip
            label={`Requests for my listings (${hosting.length})`}
            selected={side === 'hosting'}
            onPress={() => setChosen('hosting')}
          />
        </View>
      }
      ListEmptyComponent={
        side === 'renting' ? (
          <EmptyState
            title="No bookings yet"
            message="Open a rental and choose Request to book. It will appear here."
            actionLabel="Browse rentals"
            onAction={() => router.push('/')}
          />
        ) : (
          <EmptyState
            title="No requests yet"
            message="When someone asks to book one of your listings, you answer it here."
          />
        )
      }
      renderItem={({ item }) => (
        <View style={styles.item}>
          <BookingCard booking={item} userId={userId} />
          <View style={styles.links}>
            {item.listing_id && (
              <Button
                label="Listing"
                variant="ghost"
                style={styles.flex}
                onPress={() => router.push(`/listing/${item.listing_id}`)}
              />
            )}
            {/* Booking always creates the conversation, so a renter can open it
                through start_conversation. A landlord reaches it from Messages. */}
            {item.listing_id && item.renter_id === userId && (
              <Button
                label="Chat"
                variant="ghost"
                style={styles.flex}
                onPress={() =>
                  openChat.mutate(item.listing_id!, {
                    onSuccess: (id) => router.push(`/conversation/${id}`),
                  })
                }
              />
            )}
            {item.landlord_id === userId && (
              <Button
                label="Messages"
                variant="ghost"
                style={styles.flex}
                onPress={() => router.push('/messages')}
              />
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: { gap: spacing.xs },
  links: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
