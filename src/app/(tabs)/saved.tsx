import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  COMPARE_MAX,
  COMPARE_MIN,
  savedChange,
  useSavedListings,
  useToggleFavorite,
  type SavedListing,
} from '@/features/listings/favorites';
import { formatLocation, formatPrice } from '@/lib/format';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';

export default function SavedScreen() {
  const { session } = useAuth();
  // Null for a render after sign-out; see ProfileScreen.
  if (!session) return null;
  return <SignedInSaved userId={session.user.id} />;
}

function SignedInSaved({ userId }: { userId: string }) {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useSavedListings(userId);
  const toggle = useToggleFavorite(userId);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  if (isPending) return <LoadingState label="Loading saved rentals…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (data.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet"
        message="Tap the heart on a rental to keep it here. You will see if it gets rented or the price changes."
        actionLabel="Browse rentals"
        onAction={() => router.push('/')}
      />
    );
  }

  const comparable = data.filter((s) => s.listings !== null);

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= COMPARE_MAX
          ? current
          : [...current, id],
    );
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected([]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.count}>
          {data.length} saved
          {selecting ? ` · ${selected.length} of ${COMPARE_MAX} selected` : ''}
        </Text>
        {comparable.length >= COMPARE_MIN && (
          <Pressable
            accessibilityRole="button"
            onPress={selecting ? stopSelecting : () => setSelecting(true)}
          >
            <Text style={styles.link}>{selecting ? 'Cancel' : 'Compare'}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {data.map((saved) => (
          <SavedRow
            key={saved.listing_id}
            saved={saved}
            selecting={selecting}
            selected={selected.includes(saved.listing_id)}
            onPress={() => {
              if (selecting) {
                if (saved.listings) toggleSelected(saved.listing_id);
              } else if (saved.listings) {
                router.push(`/listing/${saved.listing_id}`);
              }
            }}
            onRemove={() => toggle.mutate({ listingId: saved.listing_id, save: false })}
          />
        ))}
      </ScrollView>

      {selecting && (
        <View style={styles.footer}>
          <Button
            label={
              selected.length < COMPARE_MIN
                ? `Select at least ${COMPARE_MIN}`
                : `Compare ${selected.length}`
            }
            disabled={selected.length < COMPARE_MIN}
            onPress={() => {
              router.push({
                pathname: '/compare',
                params: { ids: selected.join(',') },
              });
              stopSelecting();
            }}
          />
        </View>
      )}
    </View>
  );
}

function SavedRow({
  saved,
  selecting,
  selected,
  onPress,
  onRemove,
}: {
  saved: SavedListing;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  const listing = saved.listings;
  const change = savedChange(saved);
  const cover = listing?.listing_images[0];
  const stillLive = listing?.status === 'published';

  return (
    <Pressable
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && { opacity: 0.9 },
      ]}
    >
      {cover ? (
        <Image
          source={{ uri: imageUrl(cover.storage_path) }}
          style={[styles.thumb, !stillLive && styles.thumbFaded]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]} />
      )}

      <View style={styles.info}>
        {listing ? (
          <>
            <Text style={styles.price}>{formatPrice(listing.price_rwf)}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {listing.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {formatLocation(listing.sector, listing.district)}
            </Text>
          </>
        ) : (
          <Text style={styles.meta}>This listing has been removed.</Text>
        )}
        {!!change && (
          <View style={[styles.badge, stillLive && styles.badgeNeutral]}>
            <Text style={[styles.badgeText, stillLive && styles.badgeTextNeutral]}>
              {change}
              {change.startsWith('Price') && saved.price_at_save !== null
                ? ` (was ${formatPrice(saved.price_at_save)})`
                : ''}
            </Text>
          </View>
        )}
      </View>

      {selecting ? (
        <Ionicons
          name={selected ? 'checkbox' : 'square-outline'}
          size={22}
          color={listing ? colors.softBlack : colors.border}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove from saved"
          hitSlop={8}
          onPress={onRemove}
        >
          <Ionicons name="heart" size={22} color={colors.softBlack} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  count: type.meta,
  link: type.label,
  list: { padding: spacing.md, paddingTop: 0, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  rowSelected: { borderColor: colors.softBlack },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  thumbFaded: { opacity: 0.5 },
  thumbFallback: { backgroundColor: colors.lightGray },
  info: { flex: 1, gap: 2 },
  price: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.bold,
    color: colors.softBlack,
  },
  title: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.charcoal,
  },
  meta: type.meta,
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.charcoal,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    color: colors.white,
  },
  // A price change on a live listing is news, not a warning.
  badgeNeutral: { backgroundColor: colors.lightGray },
  badgeTextNeutral: { color: colors.charcoal },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
