import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle, TextField } from '@/components/ui';
import { BadgePill } from '@/components/verification-badges';
import { useAuth } from '@/features/auth/context';
import {
  useConfirmAvailability,
  useDeleteListing,
  useMyListings,
  useSetListingStatus,
} from '@/features/listings/queries';
import {
  LANDLORD_STATUS_ACTIONS,
  LISTING_STATUS_LABELS,
  type ListingWithImages,
} from '@/features/listings/types';
import {
  useMyIdentity,
  useMyListingCases,
  useResubmitListing,
} from '@/features/verification/queries';
import { useMyListingSuspensions, useMyRestriction } from '@/features/moderation/queries';
import { CASE_STATUS_LABELS, PROFILE_BADGE_LABELS } from '@/features/verification/types';
import { signOut } from '@/lib/auth';
import { unregisterPush } from '@/lib/push';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { imageUrl, supabase } from '@/lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

export default function ProfileScreen() {
  const { session } = useAuth();
  // Null for a render after sign-out or session expiry: this tab is still
  // mounted when AuthGate's redirect to sign-in runs, since that is an effect.
  if (!session) return null;
  return <SignedInProfile userId={session.user.id} />;
}

function SignedInProfile({ userId }: { userId: string }) {
  const router = useRouter();
  const { profile, refreshProfile, isStaff } = useAuth();
  const identity = useMyIdentity(userId);
  const listingCases = useMyListingCases(userId);
  const resubmit = useResubmitListing(userId);
  const identityCase = identity.data?.latestCase ?? null;
  const restriction = useMyRestriction(userId);
  const suspensions = useMyListingSuspensions(userId);

  const { data: listings, isPending, isError, error, refetch } = useMyListings(userId);
  const setStatus = useSetListingStatus(userId);
  const confirmAvailability = useConfirmAvailability(userId);
  const deleteListing = useDeleteListing(userId);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSaveProfile() {
    if (name.trim().length < 2) {
      setFieldError('Enter your name.');
      return;
    }

    setFieldError(null);
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ full_name: name.trim() })
        .eq('id', userId);

      if (updateError) throw updateError;
      await refreshProfile();
      setEditing(false);
    } catch (e) {
      setFieldError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(listing: ListingWithImages) {
    Alert.alert(
      'Delete listing',
      `"${listing.title}" and its photos will be removed permanently.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteListing.mutate(listing.id),
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {!!restriction.data && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Your account is suspended</Text>
          <Text style={styles.noticeBody}>{restriction.data.note}</Text>
          <Text style={styles.noticeBody}>
            Your listings are hidden and you cannot post new ones until this is
            lifted.
          </Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/help/reporting')}>
            <Text style={[styles.noticeBody, styles.noticeLink]}>
              What this means and how to appeal
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.card}>
        {editing ? (
          <View style={styles.editForm}>
            <TextField
              label="Full name"
              value={name}
              onChangeText={setName}
              error={fieldError}
            />
            <View style={styles.row}>
              <Button
                label="Cancel"
                variant="ghost"
                style={styles.flex}
                onPress={() => {
                  setEditing(false);
                  setFieldError(null);
                  setName(profile?.full_name ?? '');
                }}
              />
              <Button
                label="Save"
                style={styles.flex}
                loading={saving}
                onPress={() => void onSaveProfile()}
              />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.name}>{profile?.full_name ?? 'Your profile'}</Text>
            {identity.data?.badge ? (
              <BadgePill label={PROFILE_BADGE_LABELS.identity_checked.label} />
            ) : (
              identity.isSuccess && (
                <View style={styles.identityRow}>
                  <Text style={styles.listingMeta}>
                    {identityCase?.status === 'submitted'
                      ? 'ID sent · waiting for review'
                      : identityCase
                        ? `ID ${CASE_STATUS_LABELS[identityCase.status].toLowerCase()}`
                        : 'Verify your ID so your listings can go live.'}
                  </Text>
                  {identityCase?.status !== 'submitted' && (
                    <Button
                      label="Verify your ID"
                      variant="secondary"
                      onPress={() => router.push('/verify-identity')}
                    />
                  )}
                </View>
              )
            )}
            <Button
              label="Edit profile"
              variant="secondary"
              onPress={() => setEditing(true)}
            />
          </>
        )}
      </View>

      {isStaff && (
        <Button
          label="Staff console"
          variant="secondary"
          onPress={() => router.push('/staff')}
        />
      )}

      <View style={styles.section}>
        <SectionTitle>Your listings</SectionTitle>
        {/* Posting left the tab bar to make room for Messages, so this is
            now the way in. */}
        {!!listings && listings.length > 0 && (
          <Button label="Post a rental" onPress={() => router.push('/post')} />
        )}

        {isPending ? (
          <LoadingState label="Loading your listings…" />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : listings.length === 0 ? (
          <EmptyState
            title="No listings yet"
            message="Post your first rental and it will appear here."
            actionLabel="Post a rental"
            onAction={() => router.push('/post')}
          />
        ) : (
          listings.map((listing) => {
            const cover = listing.listing_images?.[0];
            const actions = LANDLORD_STATUS_ACTIONS[listing.status] ?? [];
            const isLive = listing.status === 'published';
            // Only meaningful while the listing is in review or was refused;
            // an old approved case on a live listing says nothing new.
            const review =
              listing.status === 'pending_review' || listing.status === 'rejected'
                ? listingCases.data?.get(listing.id)
                : undefined;

            return (
              <View key={listing.id} style={styles.listingRow}>
                <Pressable
                  style={styles.listingMain}
                  accessibilityRole="button"
                  onPress={() => router.push(`/listing/${listing.id}`)}
                >
                  {cover ? (
                    <Image
                      source={{ uri: imageUrl(cover.storage_path) }}
                      style={styles.listingThumb}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.listingThumb, styles.thumbFallback]} />
                  )}

                  <View style={styles.listingInfo}>
                    <Text style={styles.listingTitle} numberOfLines={1}>
                      {listing.title}
                    </Text>
                    <Text style={styles.listingMeta}>
                      {formatPrice(listing.price_rwf)} ·{' '}
                      {formatLocation(listing.sector, listing.district)}
                    </Text>
                    <View
                      style={[styles.statusPill, isLive && styles.statusPillActive]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          isLive && styles.statusPillTextActive,
                        ]}
                      >
                        {LISTING_STATUS_LABELS[listing.status]}
                      </Text>
                    </View>
                    {review && review.status !== 'approved' && (
                      <Text style={styles.listingMeta}>
                        {CASE_STATUS_LABELS[review.status]}
                        {review.decision_note ? `: ${review.decision_note}` : ''}
                      </Text>
                    )}
                    {listing.status === 'suspended' && suspensions.data?.has(listing.id) && (
                      <Text style={styles.listingMeta}>
                        Suspended by Rwanda Rentals: {suspensions.data.get(listing.id)!.note}
                      </Text>
                    )}
                    {isLive && !!listing.availability_confirmed_at && (
                      <Text style={styles.listingMeta}>
                        Confirmed available {timeAgo(listing.availability_confirmed_at)}
                      </Text>
                    )}
                  </View>
                </Pressable>

                <View style={styles.listingActions}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    style={styles.flex}
                    onPress={() => router.push(`/listing/edit/${listing.id}`)}
                  />
                  {actions.map((action) => (
                    <Button
                      key={action.to}
                      label={action.label}
                      variant="secondary"
                      style={styles.flex}
                      loading={
                        setStatus.isPending &&
                        setStatus.variables?.id === listing.id &&
                        setStatus.variables.status === action.to
                      }
                      onPress={() =>
                        setStatus.mutate(
                          { id: listing.id, status: action.to },
                          {
                            onError: (e) =>
                              Alert.alert('Could not change the status', e.message),
                          },
                        )
                      }
                    />
                  ))}
                </View>

                {/* Its own row: re-confirming is the routine action on a live
                    listing, and the one the feed's "recently confirmed" sort
                    rewards, so it should not be squeezed between the others. */}
                {review?.status === 'changes_requested' && (
                  <Button
                    label="Send back for review"
                    loading={resubmit.isPending && resubmit.variables === listing.id}
                    onPress={() =>
                      resubmit.mutate(listing.id, {
                        onError: (e) => Alert.alert('Could not resubmit', e.message),
                      })
                    }
                  />
                )}

                {isLive && (
                  <Button
                    label="Still available"
                    variant="secondary"
                    loading={
                      confirmAvailability.isPending &&
                      confirmAvailability.variables === listing.id
                    }
                    onPress={() => confirmAvailability.mutate(listing.id)}
                  />
                )}

                {/* Destructive action sits on its own row so it is never a
                    mis-tap away from Edit or a status toggle. */}
                <Button
                  label="Delete"
                  variant="danger"
                  loading={
                    deleteListing.isPending && deleteListing.variables === listing.id
                  }
                  onPress={() => confirmDelete(listing)}
                />
              </View>
            );
          })
        )}
      </View>

      <Button
        label="Your reports"
        variant="secondary"
        onPress={() => router.push('/my-reports')}
      />

      <Button
        label="Safety and help"
        variant="secondary"
        onPress={() => router.push('/help')}
      />

      <Button
        label="Sign out"
        variant="ghost"
        onPress={() =>
          // Signing back in costs an emailed code and a wait, so this is worth
          // a confirmation even though it destroys nothing.
          Alert.alert('Sign out?', 'You will need a new code to sign back in.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              // Unregister first, while there is still a session to
              // authorise it; otherwise this phone keeps getting the
              // account's notifications after sign-out.
              onPress: () => void unregisterPush().then(signOut),
            },
          ])
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.xl, paddingBottom: spacing.xxl },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  notice: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  noticeTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.danger,
  },
  noticeLink: { textDecorationLine: 'underline' },
  noticeBody: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.charcoal,
  },
  editForm: { gap: spacing.md },
  identityRow: { gap: spacing.sm },
  name: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold,
    color: colors.softBlack,
  },

  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },

  listingRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  listingMain: { flexDirection: 'row', gap: spacing.md },
  listingThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  thumbFallback: { backgroundColor: colors.lightGray },
  listingInfo: { flex: 1, gap: 2 },
  listingTitle: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semibold,
    color: colors.softBlack,
  },
  listingMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
  },
  statusPillActive: { backgroundColor: colors.success },
  statusPillText: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold,
    color: colors.charcoal,
  },
  statusPillTextActive: { color: colors.white },
  listingActions: { flexDirection: 'row', gap: spacing.sm },
});
