import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { ImageCarousel } from '@/components/image-carousel';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useFavoriteControl } from '@/features/listings/favorites';
import { useListingDetail } from '@/features/listings/queries';
import {
  LISTING_STATUS_LABELS,
  listingFacts,
  listingTermRows,
} from '@/features/listings/types';
import { AMENITY_LABELS, knownAmenities } from '@/lib/amenities';
import { openPhoneCall, openWhatsApp } from '@/lib/contact';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { APPROX_RADIUS_M, openInMaps } from '@/lib/maps';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';

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
  const { session } = useAuth();
  const favorites = useFavoriteControl(session?.user.id ?? null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const { data: listing, isPending, isError, error, refetch } = useListingDetail(id);

  if (isPending) return <LoadingState label="Loading listing…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const location = formatLocation(listing.sector, listing.district);
  const isOwner = session?.user.id === listing.owner_id;
  // Only ever non-null for the owner; RLS hides the row from everyone else.
  const exact = listing.listing_locations;
  const exactPin =
    exact?.latitude != null && exact.longitude != null
      ? { latitude: exact.latitude, longitude: exact.longitude }
      : null;
  const approxCenter =
    listing.approx_latitude !== null && listing.approx_longitude !== null
      ? { latitude: listing.approx_latitude, longitude: listing.approx_longitude }
      : null;
  const contactPhone = listing.profiles?.whatsapp_phone ?? null;

  const contactContext = {
    listingTitle: listing.title,
    priceRwf: listing.price_rwf,
    location,
  };

  const facts = listingFacts(listing);
  const amenities = knownAmenities(listing.amenities);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => {
            const heart = isOwner ? undefined : favorites.propsFor(listing.id);
            // A listing that is no longer live can be unsaved but not saved:
            // the database only accepts favorites on published listings.
            if (!heart || (!heart.saved && listing.status !== 'published')) return null;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={heart.saved ? 'Remove from saved' : 'Save'}
                accessibilityState={{ selected: heart.saved }}
                hitSlop={8}
                onPress={heart.onToggle}
              >
                <Ionicons
                  name={heart.saved ? 'heart' : 'heart-outline'}
                  size={24}
                  color={colors.softBlack}
                />
              </Pressable>
            );
          },
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <ImageCarousel paths={listing.listing_images.map((i) => i.storage_path)} />

        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <Text style={styles.price}>
              {formatPrice(listing.price_rwf)}
              <Text style={styles.perMonth}> / month</Text>
            </Text>
            <View style={styles.priceRule} />
            <Text style={styles.title}>{listing.title}</Text>
            <Text style={styles.location}>{location}</Text>
            {!!exact?.address && (
              <Text style={styles.address}>
                {exact.address} · only you can see this
              </Text>
            )}
            <Text style={styles.posted}>
              Posted {timeAgo(listing.created_at)}
              {listing.status === 'published' && !!listing.availability_confirmed_at
                ? ` · Availability confirmed ${timeAgo(listing.availability_confirmed_at)}`
                : ''}
            </Text>
          </View>

          {listing.status !== 'published' && (
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

          <View style={styles.section}>
            <SectionTitle>Rental terms</SectionTitle>
            <View style={styles.terms}>
              {listingTermRows(listing).map((row) => (
                <View key={row.label} style={styles.termRow}>
                  <Text style={styles.termLabel}>{row.label}</Text>
                  <Text style={styles.termValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {amenities.length > 0 && (
            <View style={styles.section}>
              <SectionTitle>Amenities</SectionTitle>
              <View style={styles.factRow}>
                {amenities.map((a) => (
                  <View key={a} style={styles.factPill}>
                    <Text style={styles.factText}>{AMENITY_LABELS[a]}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.mapCaption}>As stated by the landlord.</Text>
            </View>
          )}

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

          {exactPin && isOwner && Platform.OS !== 'web' && (
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
                  void openInMaps(exactPin.latitude, exactPin.longitude, listing.title)
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
                  initialRegion={{ ...exactPin, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
                >
                  <Marker coordinate={exactPin} title={listing.title} />
                </MapView>

                <View style={styles.mapHint}>
                  <Ionicons name="navigate-outline" size={14} color={colors.white} />
                  <Text style={styles.mapHintText}>Open in Maps</Text>
                </View>
              </Pressable>
              <Text style={styles.mapCaption}>
                Tenants see an approximate area, not this pin.
              </Text>
            </View>
          )}

          {!isOwner && approxCenter && Platform.OS !== 'web' && (
            <View style={styles.section}>
              <SectionTitle>Approximate area</SectionTitle>
              {/*
                No "Open in Maps" here: navigating to the circle's centre would
                lead a tenant to the wrong street with confidence.
              */}
              <View style={styles.mapWrap}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.map}
                  pointerEvents="none"
                  initialRegion={{ ...approxCenter, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
                >
                  <Circle
                    center={approxCenter}
                    radius={APPROX_RADIUS_M}
                    strokeColor={colors.charcoal}
                    strokeWidth={1.5}
                    fillColor="rgba(31,41,55,0.12)"
                  />
                </MapView>
              </View>
              <Text style={styles.mapCaption}>
                The property is somewhere in this circle. Ask the landlord for the
                exact address.
              </Text>
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
  // The single warm mark in the app, anchored to the price. Short and heavy
  // rather than a full-width divider: it should read as an underline on the
  // number, not as a section break.
  priceRule: {
    width: 44,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  price: type.priceHero,
  perMonth: {
    ...type.body,
    color: colors.muted,
  },
  title: {
    ...type.h2,
    marginTop: spacing.xs,
  },
  location: type.body,
  address: type.meta,
  posted: {
    ...type.caption,
    marginTop: spacing.xs,
  },

  statusBanner: {
    backgroundColor: colors.lightGray,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statusText: {
    ...type.label,
    color: colors.charcoal,
  },

  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  factPill: {
    backgroundColor: colors.lightGray,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  factText: type.label,

  section: { gap: spacing.sm },
  terms: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  termRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  termLabel: type.meta,
  termValue: type.bodyStrong,
  description: type.body,
  readMore: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    color: colors.softBlack,
  },
  mapWrap: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  map: { width: '100%', height: 200 },
  mapCaption: type.caption,
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
  mapHintText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
  },

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
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    paddingVertical: spacing.md,
  },
});
