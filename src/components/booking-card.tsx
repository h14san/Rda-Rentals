import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';

import { Button } from '@/components/ui';
import {
  useCancelBooking,
  useConfirmBooking,
  useRespondBooking,
  type BookingWithPeople,
} from '@/features/bookings/queries';
import { BOOKING_STATUS_LABELS, isActiveBooking } from '@/features/bookings/types';
import {
  reviewSummary,
  useMyReviewedBookings,
  useTenantReviews,
} from '@/features/listings/extras';
import { formatShortDate } from '@/features/listings/types';
import { colors, fontFamily, radius, spacing, type } from '@/theme';
import { translate } from '@/lib/i18n';

/**
 * One booking, with the actions its viewer may take.
 *
 * Used in the bookings list and at the top of a conversation, so accepting a
 * request is possible from the place the landlord was asked about it. The
 * buttons mirror what the database functions allow each side at each stage;
 * the functions are what enforce it.
 */
export function BookingCard({
  booking: b,
  userId,
  compact,
}: {
  booking: BookingWithPeople;
  userId: string;
  /** In a conversation: no title or names, they are already on screen. */
  compact?: boolean;
}) {
  const respond = useRespondBooking();
  const confirm = useConfirmBooking();
  const cancel = useCancelBooking();
  const router = useRouter();
  const reviewed = useMyReviewedBookings(userId);
  // Only fetched by the landlord, and RLS only answers while this renter has
  // a live booking with them, or for reviews the landlord wrote.
  const isLandlordHere = b.landlord_id === userId;
  const standing = useTenantReviews(isLandlordHere ? b.renter_id : null);
  const standingSummary = standing.data ? reviewSummary(standing.data) : null;
  const iReviewedRenter = !!standing.data?.some((r) => r.booking_id === b.id);
  const busy = respond.isPending || confirm.isPending || cancel.isPending;

  const isRenter = b.renter_id === userId;
  const isLandlord = b.landlord_id === userId;
  const failed = (e: Error) => Alert.alert('That did not work', e.message);

  /** Each of these changes something for the other person, so each is confirmed. */
  function ask(title: string, message: string, action: string, run: () => void, destructive = false) {
    Alert.alert(title, message, [
      { text: 'Back', style: 'cancel' },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: run },
    ]);
  }

  const terms = `Move in ${formatShortDate(b.move_in_date)} · ${b.duration_months} month${
    b.duration_months === 1 ? '' : 's'
  }`;

  const hint = !isActiveBooking(b.status)
    ? b.status === 'cancelled' && b.cancelled_by
      ? `Cancelled by ${b.cancelled_by === 'staff' ? 'Rwanda Rentals' : `the ${b.cancelled_by}`}.`
      : null
    : b.status === 'requested'
      ? isLandlord
        ? 'Accept or decline within 72 hours. Ask anything you need in the chat first.'
        : 'The landlord has 72 hours to answer.'
      : b.status === 'accepted'
        ? isRenter
          ? 'Confirm within 72 hours to book. You will then see the exact address.'
          : 'Waiting for the renter to confirm. Your listing is off the feed meanwhile.'
        : isRenter
          ? 'The exact address is on the listing page.'
          : 'When they move in, mark the listing as rented on your profile.';

  return (
    <View style={[styles.card, compact && styles.compact]}>
      {!compact && (
        <>
          <Text style={styles.title} numberOfLines={1}>
            {b.listing_title}
          </Text>
          <Text style={styles.meta}>
            {isRenter
              ? translate('Landlord: {name}', { name: b.landlord?.full_name ?? translate('unknown') })
              : translate('Renter: {name}', { name: b.renter?.full_name ?? translate('unknown') })}
          </Text>
        </>
      )}

      <View style={styles.statusPill}>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                b.status === 'confirmed' || b.status === 'completed'
                  ? colors.success
                  : isActiveBooking(b.status)
                    ? colors.softBlack
                    : colors.muted,
            },
          ]}
        />
        <Text style={styles.status}>
          {b.mode === 'instant' && b.status === 'confirmed'
            ? 'Booked instantly'
            : BOOKING_STATUS_LABELS[b.status]}
        </Text>
      </View>
      <Text style={styles.meta}>{terms}</Text>
      {!!hint && <Text style={styles.meta}>{hint}</Text>}

      {isLandlord && b.status === 'requested' && (
        <View style={styles.row}>
          <Button
            label="Accept"
            style={styles.flex}
            disabled={busy}
            loading={respond.isPending && respond.variables?.accept === true}
            onPress={() =>
              ask(
                'Accept this request?',
                'Your listing leaves the feed while the renter confirms. Once they confirm, they see the exact address and you can exchange contact details.',
                'Accept',
                () => respond.mutate({ bookingId: b.id, accept: true }, { onError: failed }),
              )
            }
          />
          <Button
            label="Decline"
            variant="secondary"
            style={[styles.flex, styles.onTint]}
            disabled={busy}
            onPress={() =>
              ask(
                'Decline this request?',
                'The renter is told. You do not have to give a reason.',
                'Decline',
                () => respond.mutate({ bookingId: b.id, accept: false }, { onError: failed }),
                true,
              )
            }
          />
        </View>
      )}

      {isRenter && b.status === 'accepted' && (
        <Button
          label="Confirm booking"
          disabled={busy}
          loading={confirm.isPending}
          onPress={() =>
            ask(
              'Confirm this booking?',
              'The place is reserved for you and you will see the exact address. No payment is taken in the app: never pay before you have seen the place.',
              'Confirm',
              () => confirm.mutate(b.id, { onError: failed }),
            )
          }
        />
      )}

      {isLandlord && isActiveBooking(b.status) && standing.isSuccess && (
        <Text style={styles.meta}>
          {standingSummary
            ? translate('Other landlords rated this renter {avg} of 5 ({n}).', { avg: standingSummary.average, n: standingSummary.count })
            : 'No landlord has reviewed this renter yet.'}
        </Text>
      )}

      {isLandlord && b.status === 'completed' && standing.isSuccess && !iReviewedRenter && (
        <Button
          label="Review this renter"
          variant="secondary"
          style={styles.onTint}
          onPress={() =>
            router.push({ pathname: '/rate/[bookingId]', params: { bookingId: b.id, about: 'renter' } })
          }
        />
      )}

      {/* Rule 13: a review exists only on the far side of a completed rental. */}
      {isRenter && b.status === 'completed' && reviewed.data && !reviewed.data.has(b.id) && (
        <Button
          label="Write a review"
          variant="secondary"
          style={styles.onTint}
          onPress={() => router.push(`/rate/${b.id}`)}
        />
      )}

      {/* A landlord declines a request; cancelling is for after they accepted. */}
      {isActiveBooking(b.status) && (isRenter || (isLandlord && b.status !== 'requested')) && (
        <Button
          label={b.status === 'requested' ? 'Withdraw request' : 'Cancel booking'}
          variant="danger"
          disabled={busy}
          loading={cancel.isPending}
          onPress={() =>
            ask(
              b.status === 'requested' ? 'Withdraw this request?' : 'Cancel this booking?',
              b.status === 'confirmed'
                ? 'The other person is told, the exact address is hidden again and the listing goes back on the feed.'
                : 'The other person is told.',
              b.status === 'requested' ? 'Withdraw' : 'Cancel booking',
              () => cancel.mutate({ bookingId: b.id }, { onError: failed }),
              true,
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // A tinted card, no border. Secondary buttons inside it are white so they
  // still read as buttons on the tint.
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  compact: { borderRadius: 0 },
  title: type.bodyStrong,
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  status: { ...type.caption, fontFamily: fontFamily.semibold, color: colors.softBlack },
  onTint: { backgroundColor: colors.white },
  meta: type.meta,
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1 },
});
