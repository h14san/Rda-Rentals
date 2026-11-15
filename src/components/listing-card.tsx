import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { CompactBadges } from '@/components/verification-badges';
import { listingFacts, type ListingWithImages } from '@/features/listings/types';
import { formatLocation, formatPrice, formatPriceCompact, timeAgo } from '@/lib/format';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';

/**
 * Feed card, in two sizes.
 *
 * `compact` is the default on Explore: half the screen wide, so four to six
 * places are on screen at once and a long feed is a scan rather than a scroll.
 * It keeps only what decides whether to tap: the photo, the price, where it is
 * and what it is. The large card adds the title, the checks and when
 * availability was confirmed, for looking at fewer places more closely.
 *
 * Neither has a box. The photo is the card and the text sits under it.
 */
export function ListingCard({
  listing,
  onPress,
  favorite,
  compact,
}: {
  listing: ListingWithImages;
  onPress: () => void;
  /** Omitted where saving makes no sense, e.g. a landlord's own listings. */
  favorite?: { saved: boolean; onToggle: () => void };
  compact?: boolean;
}) {
  const cover = listing.listing_images?.[0];
  const facts = listingFacts(listing);
  const checked = (listing.listing_badges?.length ?? 0) > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, ${formatPrice(listing.price_rwf)} per month`}
      onPress={onPress}
      style={({ pressed }) => [
        compact ? styles.cardCompact : styles.card,
        pressed && { opacity: 0.9 },
      ]}
    >
      <View>
        {cover ? (
          <Image
            source={{ uri: imageUrl(cover.storage_path) }}
            style={compact ? styles.imageCompact : styles.image}
            contentFit="cover"
            // Fades in over the placeholder instead of popping, which reads far
            // better when images arrive slowly.
            transition={200}
            placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
          />
        ) : (
          <View style={[compact ? styles.imageCompact : styles.image, styles.imageFallback]}>
            <Ionicons name="image-outline" size={compact ? 22 : 28} color={colors.muted} />
          </View>
        )}

        {favorite && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorite.saved ? 'Remove from saved' : 'Save'}
            accessibilityState={{ selected: favorite.saved }}
            hitSlop={8}
            onPress={favorite.onToggle}
            style={[styles.heart, compact && styles.heartCompact]}
          >
            <Ionicons
              name={favorite.saved ? 'heart' : 'heart-outline'}
              size={compact ? 18 : 20}
              color={colors.white}
            />
          </Pressable>
        )}
      </View>

      {compact ? (
        <View style={styles.bodyCompact}>
          <View style={styles.priceLine}>
            <Text style={styles.priceCompact} numberOfLines={1}>
              {formatPriceCompact(listing.price_rwf)}
              <Text style={styles.perMonthCompact}> / mo</Text>
            </Text>
            {/* A green shield only: which checks, and what they mean, is on the
                listing page. Never gold, which is paid placement. */}
            {checked && (
              <Ionicons
                name="shield-checkmark"
                size={14}
                color={colors.success}
                accessibilityLabel="Checked by Rwanda Rentals"
              />
            )}
          </View>
          <Text style={styles.placeCompact} numberOfLines={1}>
            {formatLocation(listing.sector, listing.district)}
          </Text>
          <Text style={styles.metaCompact} numberOfLines={1}>
            {facts.slice(0, 2).join(' · ')}
          </Text>
        </View>
      ) : (
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
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, marginBottom: spacing.xl },
  // The grid's row gap and gutter come from here, so the list needs no
  // per-column maths: each card pads half a gutter on both sides.
  cardCompact: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm - 2,
    marginBottom: spacing.lg,
  },
  image: {
    width: '100%',
    // Slightly taller than 4:3. Rental interiors are shot in portrait on a
    // phone, and the extra height keeps a room readable instead of cropping it
    // to a letterbox.
    aspectRatio: 5 / 4,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  imageCompact: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },

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
  heartCompact: { top: spacing.sm, right: spacing.sm, width: 30, height: 30, borderRadius: 15 },

  body: { paddingTop: spacing.sm + 2, gap: 2 },
  // Price and "/ month" sit on one baseline, with the unit deliberately quiet:
  // the figure is what gets scanned, the unit only disambiguates it.
  price: type.price,
  perMonth: { ...type.meta, fontFamily: fontFamily.medium },
  title: { ...type.bodyStrong, color: colors.charcoal },
  meta: type.meta,
  confirmed: type.caption,

  bodyCompact: { paddingTop: spacing.sm, gap: 1 },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  priceCompact: {
    flexShrink: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: colors.softBlack,
  },
  perMonthCompact: { ...type.caption, fontFamily: fontFamily.medium },
  placeCompact: { ...type.label, color: colors.charcoal },
  metaCompact: type.caption,
});
