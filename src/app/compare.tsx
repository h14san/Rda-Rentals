import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { COMPARE_MAX } from '@/features/listings/favorites';
import { useListingsByIds } from '@/features/listings/queries';
import {
  LISTING_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  listingTermRows,
  type ListingWithImages,
} from '@/features/listings/types';
import { AMENITIES, AMENITY_LABELS, knownAmenities } from '@/lib/amenities';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';

const LABEL_WIDTH = 112;
const COLUMN_WIDTH = 148;

/**
 * Side-by-side comparison (Features #19).
 *
 * Read straight off listing columns, with no AI summary: the point of
 * structured terms is that the comparison is the data. An unstated term reads
 * "Not stated", never blank, so a missing deposit is visibly a question to ask.
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

  // Only amenities at least one of them has; a row of dashes is noise.
  const amenityRows = AMENITIES.filter((a) =>
    data.some((l) => knownAmenities(l.amenities).includes(a)),
  );

  const rows: { label: string; cell: (l: ListingWithImages) => string }[] = [
    { label: 'Rent', cell: (l) => formatPrice(l.price_rwf) },
    { label: 'Area', cell: (l) => formatLocation(l.sector, l.district) },
    { label: 'Type', cell: (l) => PROPERTY_TYPE_LABELS[l.property_type] },
    {
      label: 'Bedrooms',
      cell: (l) =>
        l.bedrooms === null
          ? 'Not stated'
          : l.bedrooms === 0
            ? 'Studio'
            : String(l.bedrooms),
    },
    {
      label: 'Bathrooms',
      cell: (l) => (l.bathrooms === null ? 'Not stated' : String(l.bathrooms)),
    },
    { label: 'Furnished', cell: (l) => (l.furnished ? 'Yes' : 'No') },
    // Same wording as the detail page, from the same helper.
    ...listingTermRows(data[0]).map(({ label }, i) => ({
      label,
      cell: (l: ListingWithImages) => listingTermRows(l)[i].value,
    })),
    {
      label: 'Availability',
      cell: (l) =>
        l.status === 'published'
          ? l.availability_confirmed_at
            ? `Confirmed ${timeAgo(l.availability_confirmed_at)}`
            : 'Live'
          : LISTING_STATUS_LABELS[l.status],
    },
    ...amenityRows.map((a) => ({
      label: AMENITY_LABELS[a],
      cell: (l: ListingWithImages) =>
        knownAmenities(l.amenities).includes(a) ? 'Yes' : '—',
    })),
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.row}>
            <View style={styles.labelCell} />
            {data.map((l) => {
              const cover = l.listing_images[0];
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/listing/${l.id}`)}
                  style={styles.headCell}
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

          {rows.map((row, i) => (
            <View
              key={row.label}
              style={[styles.row, i % 2 === 0 && styles.rowStriped]}
            >
              <Text style={[styles.labelCell, styles.label]}>{row.label}</Text>
              {data.map((l) => (
                <Text key={l.id} style={styles.cell}>
                  {row.cell(l)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.note}>
        Terms and amenities are as stated by each landlord. Tap a rental to open it.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingVertical: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', paddingHorizontal: spacing.md },
  rowStriped: { backgroundColor: colors.lightGray },
  labelCell: {
    width: LABEL_WIDTH,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
  },
  label: type.meta,
  headCell: {
    width: COLUMN_WIDTH,
    paddingRight: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  thumb: {
    width: COLUMN_WIDTH - spacing.sm,
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  headTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.softBlack,
  },
  cell: {
    width: COLUMN_WIDTH,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    ...type.body,
  },
  note: { ...type.caption, paddingHorizontal: spacing.md },
});
