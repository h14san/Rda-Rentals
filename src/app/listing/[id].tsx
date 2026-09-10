import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { ImageCarousel } from '@/components/image-carousel';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle } from '@/components/ui';
import { useListingDetail } from '@/features/listings/queries';
import {
  LISTING_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
} from '@/features/listings/types';
import { openPhoneCall, openWhatsApp } from '@/lib/contact';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { openInMaps } from '@/lib/maps';
import { colors, fontSize, radius, spacing } from '@/theme';

/** Collapsed height for a long description, in lines. */
const DESCRIPTION_LINES = 6;

/**
 * Roughly the character count that fills DESCRIPTION_LINES on a phone.
 *
 * A heuristic rather than a real measurement: onTextLayout reports the
 * post-truncation line count on Android but the full count on iOS, so using it
 * would need a second hidden copy of the text to measure against. The cost of
 * being wrong here is only that "Read more" appears on a description that was
 * already fully visible.
 */
const DESCRIPTION_TRUNCATE_AT = 240;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const { data: listing, isPending, isError, error, refetch } = useListingDetail(id);

  if (isPending) return <LoadingState label="Loading listing…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const location = formatLocation(listing.sector, listing.district);
  const hasCoords = listing.latitude !== null && listing.longitude !== null;
  const contactPhone = listing.profiles?.whatsapp_phone ?? listing.profiles?.phone ?? null;

  const contactContext = {
    listingTitle: listing.title,
    priceRwf: listing.price_rwf,
    location,
  };

  const facts = [
    PROPERTY_TYPE_LABELS[listing.property_type],
    listing.bedrooms === null
      ? null
      : listing.bedrooms === 0
        ? 'Studio'
        : `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'}`,
    listing.furnished ? 'Furnished' : 'Unfurnished',
  ].filter(Boolean) as string[];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '' }} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <ImageCarousel paths={listing.listing_images.map((i) => i.storage_path)} />

        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <Text style={styles.price}>
              {formatPrice(listing.price_rwf)}
              <Text style={styles.perMonth}> / month</Text>
            </Text>
            <Text style={styles.title}>{listing.title}</Text>
            <Text style={styles.location}>{location}</Text>
            {!!listing.address && <Text style={styles.address}>{listing.address}</Text>}
            <Text style={styles.posted}>Posted {timeAgo(listing.created_at)}</Text>
          </View>

          {listing.status !== 'active' && (
            <View style={styles.statusBanner}>
              <Text style={styles.statusText}>
                This listing is {LISTING_STATUS_LABELS[listing.status].toLowerCase()}.
              </Text>
            </View>
          )}

          <View style={styles.factRow}>
            {facts.map((fact) => (
              <View key={fact} style={styles.factPill}>
                <Text style={styles.factText}>{fact}</Text>
              </View>
            ))}
          </View>

          {!!listing.description && (
            <View style={styles.section}>
              <SectionTitle>About this place</SectionTitle>
              <Text
                style={styles.description}
                numberOfLines={descriptionExpanded ? undefined : DESCRIPTION_LINES}
              >
                {listing.description}
              </Text>
              {listing.description.length > DESCRIPTION_TRUNCATE_AT && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDescriptionExpanded((v) => !v)}
                >
                  <Text style={styles.readMore}>
                    {descriptionExpanded ? 'Show less' : 'Read more'}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {hasCoords && Platform.OS !== 'web' && (
            <View style={styles.section}>
              <SectionTitle>Location</SectionTitle>
              {/*
                The map stays non-interactive (pointerEvents none) so panning it
                cannot fight the page's vertical scroll, and the whole thing is
                a button instead. A map you can neither pan nor tap is a dead
                end, which is what this was.
              */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open this location in Maps"
                onPress={() =>
                  void openInMaps(listing.latitude!, listing.longitude!, listing.title)
                }
                style={({ pressed }) => [styles.mapWrap, pressed && { opacity: 0.85 }]}
              >
                <MapView
                  // Force Google on both platforms so a pin looks identical
                  // everywhere; Apple Maps has thinner coverage of Kigali
                  // sector-level detail.
                  provider={PROVIDER_GOOGLE}
                  style={styles.map}
                  pointerEvents="none"
                  initialRegion={{
                    latitude: listing.latitude!,
                    longitude: listing.longitude!,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: listing.latitude!,
                      longitude: listing.longitude!,
                    }}
                    title={listing.title}
                  />
                </MapView>

                <View style={styles.mapHint}>
                  <Ionicons name="navigate-outline" size={14} color={colors.white} />
                  <Text style={styles.mapHintText}>Open in Maps</Text>
                </View>
              </Pressable>
            </View>
          )}

        </View>
      </ScrollView>

      <View style={styles.cta}>
        {contactPhone ? (
          <>
            <Button
              label="WhatsApp"
              variant="whatsapp"
              style={styles.ctaPrimary}
              icon={<Ionicons name="logo-whatsapp" size={20} color={colors.white} />}
              onPress={() => void openWhatsApp(contactPhone, contactContext)}
            />
            <Button
              label="Call"
              variant="secondary"
              style={styles.ctaSecondary}
              icon={<Ionicons name="call-outline" size={18} color={colors.charcoal} />}
              onPress={() => void openPhoneCall(contactPhone)}
            />
          </>
        ) : (
          <Text style={styles.noContact}>
            This landlord has not added a contact number yet.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scroll: { paddingBottom: spacing.xl },
  body: { padding: spacing.md, gap: spacing.lg },

  headerBlock: { gap: 2 },
  price: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.softBlack },
  perMonth: { fontSize: fontSize.md, fontWeight: '400', color: colors.muted },
  title: { fontSize: fontSize.lg, color: colors.charcoal, marginTop: spacing.xs },
  location: { fontSize: fontSize.md, color: colors.charcoal },
  address: { fontSize: fontSize.sm, color: colors.muted },
  posted: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs },

  statusBanner: {
    backgroundColor: colors.lightGray,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statusText: { color: colors.charcoal, fontSize: fontSize.sm, fontWeight: '600' },

  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  factPill: {
    backgroundColor: colors.lightGray,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  factText: { fontSize: fontSize.sm, color: colors.charcoal },

  section: { gap: spacing.sm },
  description: { fontSize: fontSize.md, color: colors.charcoal, lineHeight: 24 },
  readMore: { fontSize: fontSize.sm, fontWeight: '600', color: colors.softBlack },
  mapWrap: { position: 'relative', borderRadius: radius.md, overflow: 'hidden' },
  map: { width: '100%', height: 200 },
  mapHint: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(17,24,39,0.8)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  mapHintText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '600' },

  cta: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  ctaPrimary: { flex: 2 },
  ctaSecondary: { flex: 1 },
  noContact: {
    flex: 1,
    textAlign: 'center',
    color: colors.muted,
    fontSize: fontSize.sm,
    paddingVertical: spacing.md,
  },
});
