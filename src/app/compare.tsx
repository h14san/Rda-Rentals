import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { COMPARE_MAX } from '@/features/listings/favorites';
import { useListingsByIds } from '@/features/listings/queries';
import {
  LISTING_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  formatShortDate,
  type ListingWithImages,
} from '@/features/listings/types';
import { AMENITIES, AMENITY_LABELS, knownAmenities } from '@/lib/amenities';
import { formatPriceCompact, timeAgo } from '@/lib/format';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';
import { translate } from '@/lib/i18n';

type Row = {
  label: string;
  cell: (l: ListingWithImages) => string;
  /** Index of the column worth pointing out (the cheapest), if any. */
  best?: number | null;
};

/** The column with the lowest stated number, or null when fewer than two state one. */
function lowest(values: (number | null)[]): number | null {
  const stated = values.filter((v): v is number => v !== null);
  if (stated.length < 2) return null;
  const min = Math.min(...stated);
  // A tie is not a winner.
  return stated.filter((v) => v === min).length === 1 ? values.indexOf(min) : null;
}

/**
 * Side-by-side comparison (Features #19).
 *
 * Every column fits the screen: two, three or four places share the width
 * equally and nothing scrolls sideways. To make that readable at four columns
 * the label is a line of its own above each row of values, instead of a fifth
 * column eating a quarter of the width, and the values are short on purpose
 * ("250K", "6 mo"). The photos stay pinned to the top while the rows scroll,
 * so a value is never read against the wrong place.
 *
 * Read straight off listing columns, with no AI summary: the point of
 * structured terms is that the comparison is the data. An unstated term reads
 * "—", never a guess.
 */
export default function CompareScreen() {
  const router = useRouter();
  const { ids: raw } = useLocalSearchParams<{ ids?: string }>();
  const ids = (raw ?? '').split(',').filter(Boolean).slice(0, COMPARE_MAX);

  const { data, isPending, isError, error, refetch } = useListingsByIds(ids);

  if (ids.length === 0) {
    return <EmptyState title="Nothing to compare" message="Pick rentals from Saved." />;
  }
  if (isPending) return <LoadingState label="Loading rentals…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (data.length < 2) {
    return (
      <EmptyState
        title="Not enough to compare"
        message="Some of these rentals are no longer listed."
      />
    );
  }

  const none = '—';
  const months = (n: number | null) => (n === null ? none : `${n} mo`);

  const rows: Row[] = [
    {
      label: 'Rent per month',
      cell: (l) => formatPriceCompact(l.price_rwf),
      best: lowest(data.map((l) => l.price_rwf)),
    },
    {
      label: 'Deposit',
      cell: (l) => (l.deposit_rwf === null ? none : formatPriceCompact(l.deposit_rwf)),
      best: lowest(data.map((l) => l.deposit_rwf)),
    },
    { label: 'Area', cell: (l) => l.sector ?? l.district ?? none },
    { label: 'Type', cell: (l) => PROPERTY_TYPE_LABELS[l.property_type] },
    {
      label: 'Bedrooms',
      cell: (l) => (l.bedrooms === null ? none : l.bedrooms === 0 ? 'Studio' : String(l.bedrooms)),
    },
    { label: 'Bathrooms', cell: (l) => (l.bathrooms === null ? none : String(l.bathrooms)) },
    { label: 'Furnished', cell: (l) => (l.furnished ? 'Yes' : 'No') },
    { label: 'Size', cell: (l) => (l.size_sqm === null ? none : `${l.size_sqm} m²`) },
    { label: 'Minimum stay', cell: (l) => months(l.min_rental_months) },
    {
      label: 'Available from',
      cell: (l) => (l.available_from === null ? 'Now' : formatShortDate(l.available_from)),
    },
    {
      label: 'Availability',
      cell: (l) =>
        l.status === 'published'
          ? l.availability_confirmed_at
            ? translate('Confirmed {ago}', { ago: timeAgo(l.availability_confirmed_at) })
            : 'Live'
          : LISTING_STATUS_LABELS[l.status],
    },
    {
      label: 'Checks by Rwanda Rentals',
      cell: (l) => {
        const n = l.listing_badges?.length ?? 0;
        return n === 0 ? 'None yet' : `${n} check${n === 1 ? '' : 's'}`;
      },
    },
  ];

  // Only amenities at least one of them has; a row of dashes is noise.
  const amenityRows = AMENITIES.filter((a) =>
    data.some((l) => knownAmenities(l.amenities).includes(a)),
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.head}>
        {data.map((l) => {
          const cover = l.listing_images[0];
          return (
            <Pressable
              key={l.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${l.title}`}
              onPress={() => router.push(`/listing/${l.id}`)}
              style={styles.column}
            >
              {cover ? (
                <Image
                  source={{ uri: imageUrl(cover.storage_path) }}
                  style={styles.thumb}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.thumb} />
              )}
              <Text style={styles.headTitle} numberOfLines={2}>
                {l.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {rows.map((row, r) => (
        <View key={row.label} style={[styles.block, r % 2 === 1 && styles.blockAlt]}>
          <Text style={styles.label}>{row.label}</Text>
          <View style={styles.values}>
            {data.map((l, i) => (
              <Text
                key={l.id}
                style={[styles.value, styles.column, row.best === i && styles.best]}
              >
                {row.cell(l)}
              </Text>
            ))}
          </View>
        </View>
      ))}

      {amenityRows.length > 0 && (
        <>
          <Text style={styles.groupTitle}>Amenities</Text>
          {amenityRows.map((a) => (
            <View key={a} style={styles.block}>
              <Text style={styles.label}>{AMENITY_LABELS[a]}</Text>
              <View style={styles.values}>
                {data.map((l) => {
                  const has = knownAmenities(l.amenities).includes(a);
                  return (
                    <View
                      key={l.id}
                      style={styles.column}
                      accessible
                      accessibilityLabel={has ? 'Yes' : 'Not listed'}
                    >
                      <Ionicons
                        name={has ? 'checkmark' : 'remove'}
                        size={18}
                        color={has ? colors.softBlack : colors.border}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.note}>
        The lowest rent and deposit are in bold. Terms and amenities are as stated by
        each landlord. Tap a photo to open that rental.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: spacing.xxl },
  // Every listing gets the same share of the width, in the header and in each
  // row, so a value always sits under its own photo.
  column: { flex: 1, paddingHorizontal: spacing.xs },
  head: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md - spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  // A fixed height, not a ratio: with two listings a ratio made each photo
  // half the screen wide and as tall as that implies.
  thumb: {
    width: '100%',
    height: 92,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  blockAlt: { backgroundColor: colors.lightGray },
  headTitle: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    lineHeight: 16,
    color: colors.softBlack,
  },
  block: {
    paddingHorizontal: spacing.md - spacing.xs,
    paddingVertical: spacing.sm + 4,
    gap: spacing.xs,
  },
  label: { ...type.caption, paddingHorizontal: spacing.xs },
  values: { flexDirection: 'row', alignItems: 'flex-start' },
  value: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.charcoal,
  },
  best: { fontFamily: fontFamily.bold, color: colors.softBlack },
  groupTitle: {
    ...type.bodyStrong,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  note: { ...type.caption, padding: spacing.md },
});
