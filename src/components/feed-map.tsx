import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { type MapBounds, type SortOrder, useListingsFeed } from '@/features/listings/queries';
import type { Filters } from '@/features/listings/types';
import { Alert } from '@/lib/alert';
import { formatPriceCompact } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { KIGALI_CENTER } from '@/lib/locations';
import { APPROX_RADIUS_M } from '@/lib/maps';
import {
  currentPosition,
  isInRwanda,
  requestLocationAccess,
  type LocationAccess,
} from '@/lib/my-location';
import { colors, fontFamily, fontSize, radius, shadow, spacing, type } from '@/theme';

/** About 4 km across: a neighbourhood, with the next one at the edges. */
const NEAR_ME_DELTA = 0.04;

/**
 * Region to search bounds, rounded outward to 0.01° (about 1.1 km). Rounding
 * keeps the request coarse (it names an area, not the renter's position) and
 * means a small nudge of the map is the same search, served from the cache.
 */
function boundsOf(r: Region): MapBounds {
  const floor = (n: number) => Math.floor(n * 100) / 100;
  const ceil = (n: number) => Math.ceil(n * 100) / 100;
  return {
    south: floor(r.latitude - r.latitudeDelta / 2),
    north: ceil(r.latitude + r.latitudeDelta / 2),
    west: floor(r.longitude - r.longitudeDelta / 2),
    east: ceil(r.longitude + r.longitudeDelta / 2),
  };
}

function sameBounds(a: MapBounds, b: MapBounds): boolean {
  return a.south === b.south && a.north === b.north && a.west === b.west && a.east === b.east;
}

/**
 * The feed as a map (Features #12).
 *
 * Opening it asks for the renter's location (when in use, never at launch)
 * and, if they are in Rwanda, centres on them. It then searches the area on
 * screen with the same filters and sort as the list; moving the map offers
 * "Search this area" rather than refetching on every drag, which on mobile
 * data would spend a request per pan.
 *
 * Every marker sits on the listing's approximate point, never the real one,
 * and carries its 500 m circle so the map cannot be read as an address. The
 * price bubble is the tap target because circles are not tappable on iOS.
 */
export function FeedMap({
  filters,
  sort,
  onOpen,
}: {
  filters: Filters;
  sort: SortOrder;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const mapRef = useRef<MapView>(null);
  const [access, setAccess] = useState<LocationAccess | null>(null);
  const [locating, setLocating] = useState(false);
  const [outsideRwanda, setOutsideRwanda] = useState(false);
  const [searched, setSearched] = useState<MapBounds>(() => boundsOf(KIGALI_CENTER));
  const [visible, setVisible] = useState<MapBounds>(searched);
  // The next region the map settles on is one we moved it to (first layout,
  // or centring on the renter), so it becomes the search instead of offering
  // "Search this area" for a move nobody made.
  const adoptNextRegion = useRef(true);

  const feed = useListingsFeed(filters, sort, Platform.OS !== 'web', searched);
  const listings = feed.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = feed.data?.pages[0]?.total ?? 0;

  const centreOnMe = async (fromButton: boolean) => {
    setLocating(true);
    const answer = await requestLocationAccess();
    setAccess(answer);
    if (answer === 'blocked' && fromButton) {
      setLocating(false);
      Alert.alert(
        'Location is off for this app',
        'Allow location for Rwanda Rentals in your phone settings to see places near you.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    if (answer !== 'granted') {
      setLocating(false);
      return;
    }
    const position = await currentPosition();
    setLocating(false);
    if (!position) {
      if (fromButton)
        Alert.alert('Could not find you', 'Check that location is switched on, then try again.');
      return;
    }
    if (!isInRwanda(position)) {
      setOutsideRwanda(true);
      return;
    }
    setOutsideRwanda(false);
    adoptNextRegion.current = true;
    mapRef.current?.animateToRegion(
      { ...position, latitudeDelta: NEAR_ME_DELTA, longitudeDelta: NEAR_ME_DELTA },
      600,
    );
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.unsupported}>
        <Text style={type.meta}>The map is only available in the mobile app.</Text>
      </View>
    );
  }

  const placed = listings.filter(
    (l) => l.approx_latitude !== null && l.approx_longitude !== null,
  );
  const areaChanged = !sameBounds(visible, searched);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={KIGALI_CENTER}
        showsUserLocation={access === 'granted'}
        // Our own button sits with the other controls, and the native one
        // does nothing before permission is granted.
        showsMyLocationButton={false}
        toolbarEnabled={false}
        // Asked when the renter first opens the map, which is the moment the
        // question makes sense, and never at launch.
        onMapReady={() => void centreOnMe(false)}
        onRegionChangeComplete={(region) => {
          const next = boundsOf(region);
          setVisible(next);
          if (adoptNextRegion.current) {
            adoptNextRegion.current = false;
            setSearched(next);
          }
        }}
      >
        {placed.map((l) => {
          const center = {
            latitude: l.approx_latitude!,
            longitude: l.approx_longitude!,
          };
          return [
            <Circle
              key={`${l.id}-area`}
              center={center}
              radius={APPROX_RADIUS_M}
              strokeColor="rgba(31,41,55,0.5)"
              strokeWidth={1}
              fillColor="rgba(31,41,55,0.08)"
            />,
            <Marker
              key={l.id}
              coordinate={center}
              onPress={() => onOpen(l.id)}
              // A static custom view; without this Android re-renders every
              // marker bitmap on each frame, which stutters on cheap phones.
              tracksViewChanges={false}
            >
              <View style={styles.bubble}>
                <Text style={styles.bubbleText}>{formatPriceCompact(l.price_rwf)}</Text>
              </View>
            </Marker>,
          ];
        })}
      </MapView>

      <View style={styles.topRow} pointerEvents="box-none">
        {areaChanged ? (
          <Pressable
            style={styles.searchArea}
            onPress={() => setSearched(visible)}
            accessibilityRole="button"
          >
            <Ionicons name="search" size={16} color={colors.softBlack} />
            <Text style={styles.searchAreaText}>Search this area</Text>
          </Pressable>
        ) : feed.isFetching ? (
          <View style={styles.searchArea}>
            <ActivityIndicator size="small" color={colors.softBlack} />
            <Text style={styles.searchAreaText}>Looking in this area…</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        style={styles.locate}
        onPress={() => void centreOnMe(true)}
        accessibilityRole="button"
        accessibilityLabel={t('Show places near me')}
      >
        {locating ? (
          <ActivityIndicator size="small" color={colors.softBlack} />
        ) : (
          <Ionicons
            name={access === 'granted' ? 'navigate' : 'navigate-outline'}
            size={20}
            color={colors.softBlack}
          />
        )}
      </Pressable>

      <View style={styles.footer}>
        {feed.isError ? (
          <Text style={styles.footerText}>Could not load this area. Check your connection.</Text>
        ) : feed.isPending ? (
          <Text style={styles.footerText}>Looking in this area…</Text>
        ) : total === 0 ? (
          <Text style={styles.footerText}>
            No places here match. Zoom out or move the map, then search this area.
          </Text>
        ) : (
          <Text style={styles.footerText}>
            {t('{shown} of {total} places in this area', { shown: placed.length, total })}
            {' · '}
            {t('areas are approximate')}
          </Text>
        )}
        {outsideRwanda && (
          <Text style={styles.footerText}>
            You seem to be outside Rwanda, so the map shows Kigali.
          </Text>
        )}
        {feed.isError ? (
          <Button label="Try again" variant="secondary" onPress={() => void feed.refetch()} />
        ) : feed.hasNextPage ? (
          <Button
            label="Load more"
            variant="secondary"
            loading={feed.isFetchingNextPage}
            onPress={() => void feed.fetchNextPage()}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  unsupported: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  bubble: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.softBlack,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  bubbleText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.softBlack,
  },
  topRow: {
    position: 'absolute',
    top: spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  searchArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow,
  },
  searchAreaText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.softBlack,
  },
  locate: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...shadow,
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  footerText: type.caption,
});
