import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';

import { ErrorState, LoadingState } from '@/components/states';
import { Button, Chip, SectionTitle, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useRequestBooking } from '@/features/bookings/queries';
import { DURATION_OPTIONS, wouldBookInstantly } from '@/features/bookings/types';
import { useListingDetail } from '@/features/listings/queries';
import { moveInOptions } from '@/features/listings/terms-fields';
import { formatShortDate } from '@/features/listings/types';
import { formatPrice } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';
import { translate } from '@/lib/i18n';

/**
 * Book a listing: a move-in date, a length of stay, and an optional note.
 *
 * No application form (§23). Whether this books at once or asks the landlord
 * is decided by the server from the listing's settings; the screen works out
 * the same answer first so the button says what it will really do.
 */
export default function BookScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const listing = useListingDetail(listingId);
  const request = useRequestBooking();

  const [moveIn, setMoveIn] = useState<string | null>(null);
  const [months, setMonths] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  // "Another date": most leases start on the 1st, but not all moves do.
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  /** Reads DD/MM/YYYY into an ISO date, refusing impossible and past days. */
  function onCustomDate(text: string) {
    setCustomText(text);
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
    if (!m) {
      setMoveIn(null);
      setCustomError(text.trim() ? 'Write it as day/month/year, for example 15/01/2027.' : null);
      return;
    }
    const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // new Date(2027, 1, 31) rolls over to March; a date that did not survive
    // the round trip was never a real day.
    if (date.getDate() !== day || date.getMonth() !== month - 1) {
      setMoveIn(null);
      setCustomError('That day does not exist.');
    } else if (date < today) {
      setMoveIn(null);
      setCustomError('Choose a date that is not in the past.');
    } else {
      const pad = (n: number) => String(n).padStart(2, '0');
      setCustomError(null);
      setMoveIn(`${year}-${pad(month)}-${pad(day)}`);
    }
  }

  if (listing.isPending) return <LoadingState label="Loading…" />;
  if (listing.isError)
    return <ErrorState error={listing.error} onRetry={() => void listing.refetch()} />;

  const l = listing.data;

  // The 1st of the next three months, like the landlord's own form, plus the
  // listing's stated date when that is later than all of them.
  const dates = moveInOptions();
  if (l.available_from && !dates.includes(l.available_from) && l.available_from > dates[2]) {
    dates.push(l.available_from);
  }
  const durations = [...new Set([...DURATION_OPTIONS, l.min_rental_months ?? 12])].sort(
    (a, b) => a - b,
  );

  const ready = moveIn !== null && months !== null;
  const instant = ready && wouldBookInstantly(l, moveIn, months, !!profile?.full_name);
  // Instant only, and these dates do not qualify: the server would refuse.
  const blocked = ready && !instant && !l.request_to_book_enabled;

  function onSubmit() {
    if (!ready) return;
    request.mutate(
      { listingId: l.id, moveIn, months, message },
      {
        onSuccess: () => {
          Alert.alert(
            instant ? 'Booked' : 'Request sent',
            instant
              ? 'The place is reserved for you. The exact address is now on the listing page.'
              : 'The landlord has 72 hours to answer. You will be notified, and you can keep talking in the chat.',
          );
          router.replace('/bookings');
        },
        onError: (e) => Alert.alert('Could not book', e.message),
      },
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: l.instant_book_enabled ? 'Book' : 'Request to book' }} />

      <View style={styles.summary}>
        <Text style={styles.bodyStrong} numberOfLines={2}>
          {l.title}
        </Text>
        <Text style={styles.meta}>
          {formatPrice(l.price_rwf)} / month
          {l.deposit_rwf !== null ? translate(' · deposit {price}', { price: formatPrice(l.deposit_rwf) }) : ''}
        </Text>
        <Text style={styles.meta}>
          {l.available_from ? translate('Available from {date}', { date: formatShortDate(l.available_from) }) : 'Available now'}
          {l.min_rental_months ? translate(' · minimum stay {n} months', { n: l.min_rental_months }) : ''}
        </Text>
      </View>

      <View style={styles.section}>
        <SectionTitle>Move-in date</SectionTitle>
        <View style={styles.chips}>
          {dates.map((d) => (
            <Chip
              key={d}
              label={formatShortDate(d)}
              selected={!customOpen && moveIn === d}
              onPress={() => {
                setCustomOpen(false);
                setMoveIn(d);
              }}
            />
          ))}
          <Chip
            label="Another date"
            selected={customOpen}
            onPress={() => {
              setCustomOpen(true);
              onCustomDate(customText);
            }}
          />
        </View>
        {customOpen && (
          <TextField
            label="Move-in date"
            value={customText}
            onChangeText={onCustomDate}
            placeholder="15/01/2027"
            keyboardType="numbers-and-punctuation"
            error={customError}
            hint="Day / month / year"
          />
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>How long</SectionTitle>
        <View style={styles.chips}>
          {durations.map((m) => (
            <Chip
              key={m}
              label={`${m} month${m === 1 ? '' : 's'}`}
              selected={months === m}
              onPress={() => setMonths(m)}
            />
          ))}
        </View>
      </View>

      <TextField
        label="Note to the landlord (optional)"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={500}
        style={styles.note}
        hint="Sent as a chat message. Phone numbers and emails are hidden until the booking is confirmed."
      />

      {ready && (
        <View style={styles.box}>
          <Text style={styles.bodyStrong}>
            {blocked
              ? 'These dates cannot be booked'
              : instant
                ? 'This books at once'
                : 'This sends a request'}
          </Text>
          <Text style={styles.meta}>
            {blocked
              ? 'This landlord only takes instant bookings, and they need a move-in date and length of stay that meet the terms above.'
              : instant
                ? 'The landlord allows Instant Book and your dates meet their terms. The place is reserved for you and you see the exact address straight away.'
                : l.instant_book_enabled
                  ? 'Your dates do not meet the terms for Instant Book, so the landlord will be asked. They have 72 hours to answer; if they accept, you confirm, and then you see the exact address.'
                  : 'The landlord has 72 hours to answer. If they accept, you confirm, and then you see the exact address.'}
          </Text>
          <Text style={styles.caption}>
            No payment is taken in the app. Never pay before you have seen the place.
          </Text>
        </View>
      )}

      <Button
        label={instant ? 'Book now' : 'Request to book'}
        disabled={!ready || blocked}
        loading={request.isPending}
        onPress={onSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.xs },
  summary: {
    gap: 2,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.sm },
  box: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  bodyStrong: type.bodyStrong,
  meta: type.meta,
  caption: type.caption,
});
