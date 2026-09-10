import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listingFacts, type ListingWithImages } from '@/features/listings/types';
import { formatLocation, formatPrice } from '@/lib/format';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, radius, shadow, spacing, type } from '@/theme';

/**
 * Feed card: image-first, per the Airbnb-inspired direction in the framework
 * doc. Price gets the strongest type on the card because it is the field
 * tenants scan for.
 */
export function ListingCard({
  listing,
  onPress,
}: {
  listing: ListingWithImages;
  onPress: () => void;
}) {
  const cover = listing.listing_images?.[0];
  const facts = listingFacts(listing);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, ${formatPrice(listing.price_rwf)} per month`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.imageWrap}>
        {cover ? (
          <Image
            source={{ uri: imageUrl(cover.storage_path) }}
            style={styles.image}
            contentFit="cover"
            // Fades in over the placeholder instead of popping, which reads far
            // better when images arrive slowly.
            transition={200}
            placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
          />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <Text style={styles.imageFallbackText}>No photo</Text>
          </View>
        )}

        {listing.is_featured && (
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.price}>
          {formatPrice(listing.price_rwf)}
          <Text style={styles.perMonth}> / month</Text>
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {listing.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[formatLocation(listing.sector, listing.district), ...facts].join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    ...shadow,
  },
  imageWrap: { position: 'relative' },
  image: {
    width: '100%',
    // Slightly taller than 4:3. Rental interiors are shot in portrait on a
    // phone, and the extra height keeps a room readable instead of cropping it
    // to a letterbox.
    aspectRatio: 5 / 4,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  imageFallbackText: type.meta,

  featuredBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  featuredText: {
    ...type.caption,
    fontFamily: fontFamily.bold,
    color: colors.softBlack,
  },

  body: { padding: spacing.md, gap: spacing.xs },
  // Price and "/ month" sit on one baseline, with the unit deliberately quiet:
  // the figure is what gets scanned, the unit only disambiguates it.
  price: type.price,
  perMonth: {
    ...type.meta,
    fontFamily: fontFamily.medium,
  },
  title: {
    ...type.bodyStrong,
    color: colors.charcoal,
  },
  meta: type.meta,
});
