import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StaffOnly } from '@/components/staff';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, Chip, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useCancelBooking, useStaffBookings } from '@/features/bookings/queries';
import {
  BOOKING_STATUS_LABELS,
  isActiveBooking,
  type BookingStatus,
} from '@/features/bookings/types';
import { formatShortDate } from '@/features/listings/types';
import { timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

const FILTERS: (BookingStatus | null)[] = [
  null,
  'requested',
  'accepted',
  'confirmed',
  'completed',
  'cancelled',
  'declined',
  'expired',
];

/**
 * Every booking, for staff (§40): look one up, and cancel one that should not
 * stand. Staff cannot accept, decline or confirm on anyone's behalf.
 */
export default function StaffBookingsScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const bookings = useStaffBookings(status, isStaff);
  const cancel = useCancelBooking();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [note, setNote] = useState('');

  if (!isStaff) return <StaffOnly />;

  function onCancel(id: string) {
    if (!note.trim()) {
      Alert.alert('Add a note', 'Both people will read why the booking was cancelled.');
      return;
    }
    cancel.mutate(
      { bookingId: id, note },
      {
        onSuccess: () => {
          setCancelling(null);
          setNote('');
        },
        onError: (e) => Alert.alert('That did not work', e.message),
      },
    );
  }

  return (
    <FlatList
      data={bookings.data ?? []}
      keyExtractor={(b) => b.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={bookings.isRefetching}
          onRefresh={() => void bookings.refetch()}
        />
      }
      ListHeaderComponent={
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            {FILTERS.map((f) => (
              <Chip
                key={f ?? 'all'}
                label={f ? BOOKING_STATUS_LABELS[f] : 'All'}
                selected={status === f}
                onPress={() => setStatus(f)}
              />
            ))}
          </View>
        </ScrollView>
      }
      ListEmptyComponent={
        bookings.isPending ? (
          <LoadingState label="Loading bookings…" />
        ) : bookings.isError ? (
          <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
        ) : (
          <EmptyState title="No bookings" message="Nothing matches this filter." />
        )
      }
      renderItem={({ item: b }) => (
        <View style={styles.card}>
          <Text style={styles.caption}>
            {BOOKING_STATUS_LABELS[b.status]} · {b.mode === 'instant' ? 'instant' : 'request'} ·{' '}
            {timeAgo(b.created_at)}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {b.listing_title}
          </Text>
          <Text style={styles.meta}>
            {b.renter?.full_name ?? 'unknown'} renting from {b.landlord?.full_name ?? 'unknown'}
          </Text>
          <Text style={styles.meta}>
            Move in {formatShortDate(b.move_in_date)} · {b.duration_months} months
            {b.cancelled_by ? ` · cancelled by ${b.cancelled_by}` : ''}
          </Text>

          <View style={styles.row}>
            {b.listing_id && (
              <Button
                label="Listing"
                variant="secondary"
                style={styles.flex}
                onPress={() => router.push(`/staff/listings/${b.listing_id}`)}
              />
            )}
            <Button
              label="Renter"
              variant="secondary"
              style={styles.flex}
              onPress={() => router.push(`/staff/users/${b.renter_id}`)}
            />
            <Button
              label="Landlord"
              variant="secondary"
              style={styles.flex}
              onPress={() => router.push(`/staff/users/${b.landlord_id}`)}
            />
          </View>

          {isActiveBooking(b.status) &&
            (cancelling === b.id ? (
              <>
                <TextField
                  label="Why it is being cancelled"
                  hint="Required. Shown to both people in their conversation."
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
                <View style={styles.row}>
                  <Button
                    label="Back"
                    variant="ghost"
                    style={styles.flex}
                    onPress={() => setCancelling(null)}
                  />
                  <Button
                    label="Cancel booking"
                    variant="danger"
                    style={styles.flex}
                    loading={cancel.isPending}
                    onPress={() => onCancel(b.id)}
                  />
                </View>
              </>
            ) : (
              <Button
                label="Cancel this booking…"
                variant="danger"
                onPress={() => {
                  setNote('');
                  setCancelling(b.id);
                }}
              />
            ))}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1 },
  caption: type.caption,
  title: type.bodyStrong,
  meta: type.meta,
});
