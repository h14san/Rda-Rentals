import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { ErrorState, LoadingState } from '@/components/states';
import { Button, Chip, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  MAX_IMAGES,
  captureImage,
  nextImagePosition,
  pickImages,
  removeListingImages,
  uploadListingImages,
  type PickedImage,
} from '@/features/listings/create';
import { useListingDetail, useUpdateListing } from '@/features/listings/queries';
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type PropertyType,
} from '@/features/listings/types';
import { formatPrice } from '@/lib/format';
import { KIGALI_DISTRICTS, sectorsFor } from '@/lib/locations';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';

/**
 * Edit an existing listing.
 *
 * A flat form rather than the four-step wizard used for posting: the wizard
 * exists to break a long first-time task into digestible pieces, but editing is
 * usually a single correction — a wrong price, a typo — and making someone page
 * through four screens to fix one field is worse than showing them everything.
 *
 * Photo changes are staged, not applied on the spot: nothing is uploaded or
 * deleted until Save, so backing out of the screen leaves the listing exactly
 * as it was.
 */
export default function EditListingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session!.user.id;

  const { data: listing, isPending, isError, error, refetch } = useListingDetail(id);
  const updateListing = useUpdateListing(userId);

  // Populated from the fetched row on first render after load. Keyed off the
  // listing id so a hard refresh reseeds rather than stranding stale values.
  const [seededId, setSeededId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartment');
  const [bedrooms, setBedrooms] = useState<number | null>(null);
  const [furnished, setFurnished] = useState(false);
  const [district, setDistrict] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Existing photos kept, staged removals, and newly picked ones. */
  const [keptImages, setKeptImages] = useState<{ id: string; storage_path: string }[]>(
    [],
  );
  const [removedImages, setRemovedImages] = useState<
    { id: string; storage_path: string }[]
  >([]);
  const [newImages, setNewImages] = useState<PickedImage[]>([]);
  const [photoProgress, setPhotoProgress] = useState<string | null>(null);

  if (isPending) return <LoadingState label="Loading listing…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  // RLS already blocks writing someone else's row, but failing here gives a
  // clear message instead of a policy error after the user has typed.
  if (listing.owner_id !== userId) {
    return <ErrorState error={new Error('You can only edit your own listings.')} />;
  }

  if (seededId !== listing.id) {
    setSeededId(listing.id);
    setTitle(listing.title);
    setDescription(listing.description ?? '');
    setPrice(String(listing.price_rwf));
    setPropertyType(listing.property_type);
    setBedrooms(listing.bedrooms);
    setFurnished(listing.furnished);
    setDistrict(listing.district);
    setSector(listing.sector);
    setAddress(listing.address ?? '');
    setKeptImages(
      listing.listing_images.map((i) => ({ id: i.id, storage_path: i.storage_path })),
    );
    setRemovedImages([]);
    setNewImages([]);
    return <LoadingState label="Loading listing…" />;
  }

  const priceValue = Number.parseInt(price.replace(/[^\d]/g, ''), 10);
  // Captured out of the closure: the early returns above narrow `listing`, but
  // that narrowing does not survive into an async callback.
  const listingId = listing.id;

  async function onSave() {
    const next: Record<string, string> = {};
    if (title.trim().length < 3) next.title = 'Give the listing a short title.';
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      next.price = 'Enter the monthly rent in RWF.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const totalPhotos = keptImages.length + newImages.length;
    if (totalPhotos === 0) {
      setErrors({ photos: 'Keep at least one photo.' });
      return;
    }

    try {
      // Removals first: if the upload then fails, the listing is left with
      // fewer photos rather than more than MAX_IMAGES.
      if (removedImages.length > 0) {
        setPhotoProgress('Removing photos…');
        await removeListingImages(
          removedImages.map((i) => i.id),
          removedImages.map((i) => i.storage_path),
        );
        setRemovedImages([]);
      }

      if (newImages.length > 0) {
        const start = await nextImagePosition(listingId);
        await uploadListingImages(
          userId,
          listingId,
          newImages,
          (done, total) => setPhotoProgress(`Uploading photo ${done} of ${total}…`),
          start,
        );
        setNewImages([]);
      }

      setPhotoProgress(null);

      await updateListing.mutateAsync({
        id: listingId,
        patch: {
          title: title.trim(),
          description: description.trim() || null,
          price_rwf: priceValue,
          property_type: propertyType,
          bedrooms,
          furnished,
          district,
          sector,
          address: address.trim() || null,
        },
      });
      router.back();
    } catch (e) {
      setPhotoProgress(null);
      Alert.alert(
        'Could not save',
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
    }
  }

  async function onAddPhotos() {
    const remaining = MAX_IMAGES - (keptImages.length + newImages.length);
    if (remaining <= 0) return;
    const picked = await pickImages(remaining);
    if (picked.length > 0) setNewImages((c) => [...c, ...picked].slice(0, remaining));
  }

  async function onCapturePhoto() {
    if (keptImages.length + newImages.length >= MAX_IMAGES) return;
    const shot = await captureImage();
    if (shot) setNewImages((c) => [...c, shot]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Edit listing' }} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Photos</Text>
          <Text style={styles.help}>
            The first photo is what tenants see in the feed.
          </Text>

          <View style={styles.thumbGrid}>
            {keptImages.map((img, index) => (
              <View key={img.id} style={styles.thumbWrap}>
                <Image
                  source={{ uri: imageUrl(img.storage_path) }}
                  style={styles.thumb}
                  contentFit="cover"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                  style={styles.thumbRemove}
                  onPress={() => {
                    setKeptImages((c) => c.filter((k) => k.id !== img.id));
                    // Staged, not deleted — Save applies it, leaving is a no-op.
                    setRemovedImages((c) => [...c, img]);
                  }}
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
                {index === 0 && (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverText}>Cover</Text>
                  </View>
                )}
              </View>
            ))}

            {newImages.map((img, index) => (
              <View key={`${img.uri}-${index}`} style={styles.thumbWrap}>
                <Image
                  source={{ uri: img.uri }}
                  style={styles.thumb}
                  contentFit="cover"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove new photo ${index + 1}`}
                  style={styles.thumbRemove}
                  onPress={() => setNewImages((c) => c.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
                <View style={styles.newBadge}>
                  <Text style={styles.coverText}>New</Text>
                </View>
              </View>
            ))}
          </View>

          {!!errors.photos && <Text style={styles.error}>{errors.photos}</Text>}

          {keptImages.length + newImages.length < MAX_IMAGES && (
            <View style={styles.row}>
              <Button
                label="Add photos"
                variant="secondary"
                style={styles.flex}
                onPress={() => void onAddPhotos()}
              />
              <Button
                label="Camera"
                variant="secondary"
                style={styles.flex}
                onPress={() => void onCapturePhoto()}
              />
            </View>
          )}
        </View>

        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          error={errors.title}
          maxLength={120}
        />

        <TextField
          label="Monthly rent (RWF)"
          value={price}
          onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ''))}
          error={errors.price}
          hint={
            Number.isFinite(priceValue) && priceValue > 0
              ? formatPrice(priceValue)
              : undefined
          }
          keyboardType="number-pad"
        />

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Property type</Text>
          <View style={styles.chipWrap}>
            {PROPERTY_TYPES.map((type) => (
              <Chip
                key={type}
                label={PROPERTY_TYPE_LABELS[type]}
                selected={propertyType === type}
                onPress={() => setPropertyType(type)}
              />
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Bedrooms</Text>
          <View style={styles.chipWrap}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <Chip
                key={n}
                label={n === 0 ? 'Studio' : String(n)}
                selected={bedrooms === n}
                onPress={() => setBedrooms(bedrooms === n ? null : n)}
              />
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Furnishing</Text>
          <View style={styles.chipWrap}>
            <Chip
              label="Furnished"
              selected={furnished}
              onPress={() => setFurnished(!furnished)}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>District</Text>
          <View style={styles.chipWrap}>
            {KIGALI_DISTRICTS.map((d) => (
              <Chip
                key={d}
                label={d}
                selected={district === d}
                onPress={() => {
                  setDistrict(d);
                  // A sector from the previous district would be nonsense.
                  if (d !== district) setSector(null);
                }}
              />
            ))}
          </View>
        </View>

        {!!district && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Sector</Text>
            <View style={styles.chipWrap}>
              {sectorsFor(district).map((s) => (
                <Chip
                  key={s}
                  label={s}
                  selected={sector === s}
                  onPress={() => setSector(sector === s ? null : s)}
                />
              ))}
            </View>
          </View>
        )}

        <TextField
          label="Address or landmark"
          value={address}
          onChangeText={setAddress}
        />

        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
          style={styles.textArea}
        />

        {!!photoProgress && <Text style={styles.note}>{photoProgress}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Cancel"
          variant="ghost"
          style={styles.flex}
          onPress={() => router.back()}
          disabled={updateListing.isPending}
        />
        <Button
          label="Save changes"
          style={styles.flexTwo}
          loading={updateListing.isPending}
          onPress={() => void onSave()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  field: { gap: spacing.sm },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    color: colors.charcoal,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  textArea: {
    minHeight: 120,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  note: { ...type.caption, textAlign: 'center' },
  help: type.meta,
  error: { ...type.caption, color: colors.danger },
  row: { flexDirection: 'row', gap: spacing.sm },
  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(17,24,39,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(17,24,39,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  newBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  coverText: { fontSize: 10, color: colors.white },
  flex: { flex: 1 },
  flexTwo: { flex: 2 },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
