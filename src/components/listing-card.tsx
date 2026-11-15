import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CompactBadges } from '@/components/verification-badges';
import { listingFacts, type ListingWithImages } from '@/features/listings/types';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, radius, spacing, type } from '@/theme';

/**
 * Feed card: image-first, per the Airbnb-inspired direction in the framework
 * doc. Price gets the strongest type on the card because it is the field
 * tenants scan for.
 */
export function ListingCard({
  listing,
  onPress,
  favorite,
}: {
  listing: ListingWithImages;
  onPress: () => void;
  /** Omitted where saving makes no sense, e.g. a landlord's own listings. */
  favorite?: { saved: boolean; onToggle: () => void };
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

        {favorite && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorite.saved ? 'Remove from saved' : 'Save'}
            accessibilityState={{ selected: favorite.saved }}
            hitSlop={8}
            onPress={favorite.onToggle}
            style={styles.heart}
          >
            <Ionicons
              name={favorite.saved ? 'heart' : 'heart-outline'}
              size={20}
              color={colors.white}
            />
          </Pressable>
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
        <CompactBadges badges={listing.listing_badges} />
        {!!listing.availability_confirmed_at && (
          <Text style={styles.confirmed} numberOfLines={1}>
            Availability confirmed {timeAgo(listing.availability_confirmed_at)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // No box around the card: the photo is the card, and the text sits under it
  // on the page. A border and shadow on every listing made the feed a stack of
  // frames instead of a column of places.
  card: {
    backgroundColor: colors.white,
    marginBottom: spacing.xl,
  },
  imageWrap: { position: 'relative' },
  image: {
    width: '100%',
    // Slightly taller than 4:3. Rental interiors are shot in portrait on a
    // phone, and the extra height keeps a room readable instead of cropping it
    // to a letterbox.
    aspectRatio: 5 / 4,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  imageFallbackText: type.meta,

  featuredBadge: {
    position: 'absolute',
    top: spacing.sm + 4,
    left: spacing.sm + 4,
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

  heart: {
    position: 'absolute',
    top: spacing.sm + 4,
    right: spacing.sm + 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // Same scrim as the photo badges elsewhere: legible on any photo without
    // spending the accent colour, which is reserved for price and featured.
    backgroundColor: 'rgba(17,24,39,0.55)',
  },

  body: { paddingTop: spacing.sm + 2, gap: 2 },
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
  confirmed: type.caption,
});
