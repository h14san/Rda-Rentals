import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { Button } from '@/components/ui';
import type { ListingWithImages } from '@/features/listings/types';
import { formatPriceCompact } from '@/lib/format';
import { KIGALI_CENTER } from '@/lib/locations';
import { APPROX_RADIUS_M } from '@/lib/maps';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';

/**
 * The feed as a map (Features #12).
 *
 * Every marker sits on the listing's approximate point, never the real one,
 * and carries its 500 m circle so the map cannot be read as an address. The
 * price bubble is the tap target because circles are not tappable on iOS.
 *
 * Shows the pages the list has already loaded rather than fetching everything:
 * the same request budget as the list, with "Load more" as the explicit way
 * to spend more of it.
 */
export function FeedMap({
  listings,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
}: {
  listings: ListingWithImages[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
}) {
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
  const unplaced = listings.length - placed.length;

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={KIGALI_CENTER}
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

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Showing {placed.length} of {total}
          {unplaced > 0 ? ` · ${unplaced} without a location` : ''} · areas are
          approximate
        </Text>
        {hasMore && (
          <Button
            label="Load more"
            variant="secondary"
            loading={loadingMore}
            onPress={onLoadMore}
          />
        )}
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
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  footerText: type.caption,
});
