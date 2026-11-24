import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';

import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, Chip } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useMyBookings } from '@/features/bookings/queries';
import { useUnreadCount } from '@/features/messaging/queries';
import {
  useConfirmAvailability,
  useDeleteListing,
  useMyListings,
  useSetListingStatus,
} from '@/features/listings/queries';
import {
  LANDLORD_STATUS_ACTIONS,
  LISTING_STATUS_LABELS,
  REVIEW_REASON_LABELS,
  type ListingStatus,
  type ListingWithImages,
} from '@/features/listings/types';
import { useMyListingSuspensions } from '@/features/moderation/queries';
import { useMyListingCases, useResubmitListing } from '@/features/verification/queries';
import { CASE_STATUS_LABELS } from '@/features/verification/types';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, radius, spacing, type } from '@/theme';
import { translate } from '@/lib/i18n';

/** How a landlord thinks about their listings: is it up, is it waiting, or is it down. */
type Group = 'all' | 'live' | 'waiting' | 'off';

const GROUP_OF: Record<ListingStatus, Exclude<Group, 'all'>> = {
  published: 'live',
  booking_pending: 'live',
  reserved: 'live',
  draft: 'waiting',
  pending_review: 'waiting',
  paused: 'off',
  unavailable: 'off',
  rented: 'off',
  rejected: 'off',
  suspended: 'off',
};

const GROUP_LABELS: Record<Group, string> = {
  all: 'All',
  live: 'Live',
  waiting: 'In progress',
  off: 'Off the feed',
};

const STATUS_DOT: Partial<Record<ListingStatus, string>> = {
  published: colors.success,
  reserved: colors.success,
  booking_pending: colors.gold,
  pending_review: colors.gold,
  rejected: colors.danger,
  suspended: colors.danger,
};

export default function MyListingsScreen() {
  const { session } = useAuth();
  if (!session) return null;
  return <MyListings userId={session.user.id} />;
}

/**
 * The landlord's listings.
 *
 * Each card shows the listing and at most one button: the thing most worth
 * doing to it right now. Everything else is behind the "⋯" menu. The old
 * layout put five buttons under every listing, which made three listings a
 * wall of buttons.
 */
function MyListings({ userId }: { userId: string }) {
  const router = useRouter();
  const listings = useMyListings(userId);
  const cases = useMyListingCases(userId);
  const suspensions = useMyListingSuspensions(userId);
  const setStatus = useSetListingStatus(userId);
  const confirmAvailability = useConfirmAvailability(userId);
  const resubmit = useResubmitListing(userId);
  const deleteListing = useDeleteListing(userId);

  const bookings = useMyBookings(userId);
  const unreadMessages = useUnreadCount(userId);
  const [group, setGroup] = useState<Group>('all');
  // Read once when the screen opens. "Two weeks ago" does not need to tick,
  // and a clock read during render is not allowed to.
  const [openedAt] = useState(() => Date.now());
  const [menuFor, setMenuFor] = useState<ListingWithImages | null>(null);

  const postButton = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post a rental"
            hitSlop={8}
            onPress={() => router.push('/post')}
          >
            <Ionicons name="add" size={28} color={colors.softBlack} />
          </Pressable>
        ),
      }}
    />
  );

  if (listings.isPending)
    return (
      <>
        {postButton}
        <LoadingState label="Loading your listings…" />
      </>
    );
  if (listings.isError)
    return (
      <>
        {postButton}
        <ErrorState error={listings.error} onRetry={() => void listings.refetch()} />
      </>
    );

  const failed = (e: Error) => Alert.alert('That did not work', e.message);
  const move = (id: string, status: ListingStatus) =>
    setStatus.mutate({ id, status }, { onError: failed });

  /** The review case, where it still says something the landlord must act on. */
  const reviewOf = (l: ListingWithImages) =>
    l.status === 'pending_review' || l.status === 'rejected' ? cases.data?.get(l.id) : undefined;

  /** One line under the status: why it is where it is, in the landlord's terms. */
  function noteFor(l: ListingWithImages): string | null {
    const review = reviewOf(l);
    if (review && review.status !== 'approved' && review.status !== 'submitted') {
      return `${CASE_STATUS_LABELS[review.status]}${review.decision_note ? `: ${review.decision_note}` : ''}`;
    }
    if (l.status === 'suspended') {
      const note = suspensions.data?.get(l.id)?.note;
      return note ? translate('Suspended by Rwanda Rentals: {note}', { note }) : null;
    }
    if (l.review_reason && l.status !== 'published') return REVIEW_REASON_LABELS[l.review_reason];
    if (l.status === 'published' && l.availability_confirmed_at) {
      return translate('Confirmed available {ago}', { ago: timeAgo(l.availability_confirmed_at) });
    }
    if (l.status === 'pending_review') return 'Waiting for our team to review it.';
    if (l.status === 'booking_pending') return 'A request was accepted and is waiting to be confirmed.';
    return null;
  }

  /** The single most useful thing to do with this listing now, if there is one. */
  function primaryFor(l: ListingWithImages): { label: string; loading: boolean; run: () => void } | null {
    if (reviewOf(l)?.status === 'changes_requested') {
      return {
        label: 'Send back for review',
        loading: resubmit.isPending && resubmit.variables === l.id,
        run: () => resubmit.mutate(l.id, { onError: failed }),
      };
    }
    if (l.status === 'published') {
      return {
        label: 'Still available',
        loading: confirmAvailability.isPending && confirmAvailability.variables === l.id,
        run: () => confirmAvailability.mutate(l.id, { onError: failed }),
      };
    }
    const next = LANDLORD_STATUS_ACTIONS[l.status]?.[0];
    if (!next) return null;
    return {
      // The database turns this republish into a review request; the label
      // should not promise otherwise.
      label: next.to === 'published' && l.review_reason ? 'Submit for review' : next.label,
      loading:
        setStatus.isPending &&
        setStatus.variables?.id === l.id &&
        setStatus.variables.status === next.to,
      run: () => move(l.id, next.to),
    };
  }

  function menuActions(l: ListingWithImages): SheetAction[] {
    const primary = primaryFor(l);
    return [
      { label: 'View listing', onPress: () => router.push(`/listing/${l.id}`) },
      { label: 'Edit', onPress: () => router.push(`/listing/edit/${l.id}`) },
      ...(LANDLORD_STATUS_ACTIONS[l.status] ?? [])
        .map((a) => ({
          label: a.to === 'published' && l.review_reason ? 'Submit for review' : a.label,
          onPress: () => move(l.id, a.to),
        }))
        // Already offered as the card's own button.
        .filter((a) => a.label !== primary?.label),
      {
        label: 'Delete',
        destructive: true,
        onPress: () =>
          Alert.alert(
            'Delete listing',
            translate('"{title}" and its photos will be removed permanently.', { title: l.title }),
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => deleteListing.mutate(l.id, { onError: failed }),
              },
            ],
          ),
      },
    ];
  }

  const count = (g: Group) =>
    g === 'all'
      ? listings.data.length
      : listings.data.filter((l) => GROUP_OF[l.status] === g).length;
  const items =
    group === 'all' ? listings.data : listings.data.filter((l) => GROUP_OF[l.status] === group);

  return (
    <>
      {postButton}
      <FlatList
        data={items}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={listings.isRefetching}
            onRefresh={() => void listings.refetch()}
          />
        }
        ListHeaderComponent={
          listings.data.length > 0 ? (
            <View style={styles.headerBlock}>
              {/* What is waiting for the host, in one line, each a way to it. */}
              <View style={styles.dashboard}>
                {[
                  {
                    n: bookings.data?.filter(
                      (b) => b.landlord_id === userId && b.status === 'requested',
                    ).length,
                    label: 'Requests to answer',
                    go: () => router.push('/bookings'),
                  },
                  {
                    n: unreadMessages,
                    label: 'Unread messages',
                    go: () => router.push('/messages'),
                  },
                  {
                    // Live, and not confirmed in the last two weeks.
                    n: listings.data.filter(
                      (l) =>
                        l.status === 'published' &&
                        (!l.availability_confirmed_at ||
                          openedAt - new Date(l.availability_confirmed_at).getTime() >
                            14 * 86_400_000),
                    ).length,
                    label: 'To confirm available',
                    go: () => setGroup('live'),
                  },
                ].map((tile) => (
                  <Pressable
                    key={tile.label}
                    accessibilityRole="button"
                    accessibilityLabel={`${tile.n ?? 0} ${tile.label}`}
                    onPress={tile.go}
                    style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8 }]}
                  >
                    <View style={styles.tileTop}>
                      <Text style={[styles.tileNumber, !tile.n && styles.tileNumberQuiet]}>
                        {tile.n ?? '–'}
                      </Text>
                      {!!tile.n && <View style={styles.tileDot} />}
                    </View>
                    <Text style={styles.tileLabel}>{tile.label}</Text>
                  </Pressable>
                ))}
              </View>
            <View style={styles.filters}>
              {(['all', 'live', 'waiting', 'off'] as const).map((g) => (
                <Chip
                  key={g}
                  label={`${translate(GROUP_LABELS[g])} ${count(g)}`}
                  selected={group === g}
                  onPress={() => setGroup(g)}
                />
              ))}
            </View>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          listings.data.length === 0 ? (
            <EmptyState
              icon="home-outline"
              title="No listings yet"
              message="Post your first rental and it will appear here."
              actionLabel="Post a rental"
              onAction={() => router.push('/post')}
            />
          ) : (
            <EmptyState title="Nothing here" message="No listings are in this group." />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.rule} />}
        renderItem={({ item: l }) => {
          const cover = l.listing_images?.[0];
          const note = noteFor(l);
          const primary = primaryFor(l);
          return (
            <View style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${l.title}, ${LISTING_STATUS_LABELS[l.status]}`}
                onPress={() => router.push(`/listing/${l.id}`)}
                style={({ pressed }) => [styles.main, pressed && { opacity: 0.85 }]}
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
                <View style={styles.info}>
                  <View style={styles.statusLine}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: STATUS_DOT[l.status] ?? colors.muted },
                      ]}
                    />
                    <Text style={styles.status}>{LISTING_STATUS_LABELS[l.status]}</Text>
                  </View>
                  <Text style={styles.title} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {formatPrice(l.price_rwf)} · {formatLocation(l.sector, l.district)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More options for ${l.title}`}
                  hitSlop={10}
                  onPress={() => setMenuFor(l)}
                  style={styles.more}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.charcoal} />
                </Pressable>
              </Pressable>

              {!!note && (
                <Text style={styles.note} numberOfLines={3}>
                  {note}
                </Text>
              )}

              {primary && (
                <Button
                  label={primary.label}
                  variant="secondary"
                  loading={primary.loading}
                  onPress={primary.run}
                  style={styles.primary}
                />
              )}
            </View>
          );
        }}
      />

      <ActionSheet
        visible={menuFor !== null}
        onClose={() => setMenuFor(null)}
        title={menuFor?.title}
        actions={menuFor ? menuActions(menuFor) : []}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  headerBlock: { gap: spacing.md, marginBottom: spacing.sm },
  dashboard: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    gap: 2,
    padding: spacing.md - 4,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  // Fill only. A tile with something waiting has a dark number and a dot;
  // an empty one goes quiet rather than shouting a zero.
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileNumber: type.h2,
  tileNumberQuiet: { color: colors.muted },
  tileDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.softBlack },
  tileLabel: type.caption,
  // A listing is a row on the page, not a box: photo, words, one action.
  card: { gap: spacing.sm, paddingVertical: spacing.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  main: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  info: { flex: 1, gap: 2 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { ...type.caption, fontFamily: fontFamily.semibold, color: colors.charcoal },
  title: type.bodyStrong,
  meta: type.meta,
  more: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGray,
  },
  note: type.meta,
  primary: { minHeight: 44 },
});
