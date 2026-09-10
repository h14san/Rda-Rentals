import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  useDeleteListing,
  useMyListings,
  useSetListingStatus,
} from '@/features/listings/queries';
import {
  LISTING_STATUS_LABELS,
  type ListingStatus,
  type ListingWithImages,
} from '@/features/listings/types';
import { formatRwandanPhone, normalizeRwandanPhone, signOut } from '@/lib/auth';
import { formatLocation, formatPrice } from '@/lib/format';
import { imageUrl, supabase } from '@/lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const userId = session!.user.id;

  const { data: listings, isPending, isError, error, refetch } = useMyListings(userId);
  const setStatus = useSetListingStatus(userId);
  const deleteListing = useDeleteListing(userId);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp_phone ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSaveProfile() {
    const normalized = normalizeRwandanPhone(whatsapp);
    if (!normalized) {
      setFieldError('Enter a Rwandan mobile number, for example 0788 123 456.');
      return;
    }
    if (name.trim().length < 2) {
      setFieldError('Enter your name.');
      return;
    }

    setFieldError(null);
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ full_name: name.trim(), whatsapp_phone: normalized })
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

  /** Rented and live are the two states a landlord actually toggles between. */
  function nextStatus(current: ListingStatus): ListingStatus | null {
    if (current === 'active') return 'rented';
    if (current === 'rented') return 'active';
    if (current === 'draft') return 'active';
    return null;
  }

  function statusActionLabel(current: ListingStatus): string | null {
    if (current === 'active') return 'Mark rented';
    if (current === 'rented') return 'Mark available';
    if (current === 'draft') return 'Publish';
    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {editing ? (
          <View style={styles.editForm}>
            <TextField label="Full name" value={name} onChangeText={setName} />
            <TextField
              label="WhatsApp number"
              value={whatsapp}
              onChangeText={setWhatsapp}
              keyboardType="phone-pad"
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
                  setWhatsapp(profile?.whatsapp_phone ?? '');
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
            <Text style={styles.contact}>
              {profile?.whatsapp_phone
                ? formatRwandanPhone(profile.whatsapp_phone)
                : 'No contact number'}
            </Text>
            <Button
              label="Edit profile"
              variant="secondary"
              onPress={() => setEditing(true)}
            />
          </>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>Your listings</SectionTitle>

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
            const action = statusActionLabel(listing.status);
            const target = nextStatus(listing.status);

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
                      style={[
                        styles.statusPill,
                        listing.status === 'active' && styles.statusPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          listing.status === 'active' && styles.statusPillTextActive,
                        ]}
                      >
                        {LISTING_STATUS_LABELS[listing.status]}
                      </Text>
                    </View>
                  </View>
                </Pressable>

                <View style={styles.listingActions}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    style={styles.flex}
                    onPress={() => router.push(`/listing/edit/${listing.id}`)}
                  />
                  {action && target && (
                    <Button
                      label={action}
                      variant="secondary"
                      style={styles.flex}
                      loading={
                        setStatus.isPending && setStatus.variables?.id === listing.id
                      }
                      onPress={() =>
                        setStatus.mutate({ id: listing.id, status: target })
                      }
                    />
                  )}
                </View>

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
              onPress: () => void signOut(),
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
  editForm: { gap: spacing.md },
  name: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold,
    color: colors.softBlack,
  },
  contact: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.sm,
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
