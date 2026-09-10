import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
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
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { Button, Chip, SectionTitle, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  MAX_IMAGES,
  captureImage,
  createDraftListing,
  pickImages,
  publishListing,
  uploadListingImages,
  type PickedImage,
} from '@/features/listings/create';
import { listingKeys } from '@/features/listings/queries';
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type PropertyType,
} from '@/features/listings/types';
import { formatPrice } from '@/lib/format';
import { KIGALI_CENTER, KIGALI_DISTRICTS, sectorsFor } from '@/lib/locations';
import { colors, fontSize, radius, spacing } from '@/theme';

type Step = 'photos' | 'details' | 'location' | 'review';

const STEP_ORDER: Step[] = ['photos', 'details', 'location', 'review'];

const STEP_TITLES: Record<Step, string> = {
  photos: 'Add photos',
  details: 'Describe the place',
  location: 'Set the location',
  review: 'Review and publish',
};

export default function PostListingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session!.user.id;

  const [step, setStep] = useState<Step>('photos');
  const [images, setImages] = useState<PickedImage[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null);
  const [bedrooms, setBedrooms] = useState<number | null>(null);
  const [furnished, setFurnished] = useState(false);

  const [district, setDistrict] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const priceValue = Number.parseInt(price.replace(/[^\d]/g, ''), 10);
  const stepIndex = STEP_ORDER.indexOf(step);

  function resetForm() {
    setStep('photos');
    setImages([]);
    setTitle('');
    setDescription('');
    setPrice('');
    setPropertyType(null);
    setBedrooms(null);
    setFurnished(false);
    setDistrict(null);
    setSector(null);
    setAddress('');
    setPin(null);
    setErrors({});
    setProgress(null);
  }

  async function onAddFromLibrary() {
    const picked = await pickImages(MAX_IMAGES - images.length);
    if (picked.length === 0) return;
    setImages((current) => [...current, ...picked].slice(0, MAX_IMAGES));
  }

  async function onAddFromCamera() {
    const shot = await captureImage();
    if (shot) setImages((current) => [...current, shot].slice(0, MAX_IMAGES));
  }

  function validateDetails(): boolean {
    const next: Record<string, string> = {};
    if (title.trim().length < 3) next.title = 'Give the listing a short title.';
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      next.price = 'Enter the monthly rent in RWF.';
    }
    if (!propertyType) next.propertyType = 'Choose a property type.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (step === 'photos') {
      if (images.length === 0) {
        // Inline, like every other validation error in this form. A modal for
        // one missing field is heavier than the mistake.
        setErrors({ photos: 'Add at least one photo before continuing.' });
        return;
      }
      setErrors({});
      setStep('details');
    } else if (step === 'details') {
      if (validateDetails()) setStep('location');
    } else if (step === 'location') {
      setStep('review');
    }
  }

  function goBack() {
    if (stepIndex > 0) setStep(STEP_ORDER[stepIndex - 1]);
  }

  /**
   * Publish.
   *
   * The row is created as a draft first so uploads have a listing id to file
   * under; it only flips to active once every image has landed. A failure part
   * way through therefore leaves a draft the landlord can finish, never a live
   * listing with missing photos.
   */
  async function onPublish() {
    setSubmitting(true);
    setProgress('Creating listing…');
    try {
      const draft = await createDraftListing({
        ownerId: userId,
        title: title.trim(),
        description: description.trim() || null,
        priceRwf: priceValue,
        propertyType: propertyType!,
        bedrooms,
        furnished,
        district,
        sector,
        address: address.trim() || null,
        latitude: pin?.latitude ?? null,
        longitude: pin?.longitude ?? null,
      });

      await uploadListingImages(userId, draft.id, images, (done, total) =>
        setProgress(`Uploading photo ${done} of ${total}…`),
      );

      setProgress('Publishing…');
      await publishListing(draft.id);

      await queryClient.invalidateQueries({ queryKey: listingKeys.mine(userId) });
      await queryClient.invalidateQueries({ queryKey: ['listings', 'feed'] });

      resetForm();
      Alert.alert('Listing published', 'Your rental is now live in the feed.');
      router.push(`/listing/${draft.id}`);
    } catch (e) {
      Alert.alert(
        'Could not publish',
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.progressRow}>
        {STEP_ORDER.map((s, i) => (
          <View
            key={s}
            style={[styles.progressBar, i <= stepIndex && styles.progressBarActive]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionTitle>{STEP_TITLES[step]}</SectionTitle>

        {step === 'photos' && (
          <View style={styles.section}>
            <Text style={styles.help}>
              Add up to {MAX_IMAGES} photos. They are resized before upload, so this works
              on a slow connection.
            </Text>

            <View style={styles.thumbGrid}>
              {images.map((img, index) => (
                <View key={`${img.uri}-${index}`} style={styles.thumbWrap}>
                  <Image source={{ uri: img.uri }} style={styles.thumb} contentFit="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${index + 1}`}
                    style={styles.thumbRemove}
                    onPress={() =>
                      setImages((current) => current.filter((_, i) => i !== index))
                    }
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
            </View>

            {!!errors.photos && <Text style={styles.error}>{errors.photos}</Text>}

            {images.length < MAX_IMAGES && (
              <View style={styles.row}>
                <Button
                  label="Choose photos"
                  variant="secondary"
                  style={styles.flex}
                  onPress={() => void onAddFromLibrary()}
                />
                <Button
                  label="Camera"
                  variant="secondary"
                  style={styles.flex}
                  onPress={() => void onAddFromCamera()}
                />
              </View>
            )}
          </View>
        )}

        {step === 'details' && (
          <View style={styles.section}>
            <TextField
              label="Title"
              value={title}
              onChangeText={setTitle}
              error={errors.title}
              placeholder="Bright 2-bedroom near Kimironko market"
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
              placeholder="150000"
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
              {!!errors.propertyType && (
                <Text style={styles.error}>{errors.propertyType}</Text>
              )}
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

            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Water and electricity included, secure compound, 10 minutes from the bus stop…"
              multiline
              numberOfLines={5}
              style={styles.textArea}
            />
          </View>
        )}

        {step === 'location' && (
          <View style={styles.section}>
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
                      setSector(null);
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
              placeholder="Near Kimironko market, KG 11 Ave"
            />

            {Platform.OS !== 'web' && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Drop a pin</Text>
                <Text style={styles.help}>
                  Tap the map where the property is. Tenants see this pin on the listing.
                </Text>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.pickerMap}
                  initialRegion={KIGALI_CENTER}
                  onPress={(e) => setPin(e.nativeEvent.coordinate)}
                >
                  {pin && <Marker coordinate={pin} />}
                </MapView>
              </View>
            )}
          </View>
        )}

        {step === 'review' && (
          <View style={styles.section}>
            <View style={styles.reviewCard}>
              {images[0] && (
                <Image
                  source={{ uri: images[0].uri }}
                  style={styles.reviewImage}
                  contentFit="cover"
                />
              )}
              <View style={styles.reviewBody}>
                <Text style={styles.reviewPrice}>
                  {Number.isFinite(priceValue) ? formatPrice(priceValue) : '—'}
                  <Text style={styles.reviewPerMonth}> / month</Text>
                </Text>
                <Text style={styles.reviewTitle}>{title}</Text>
                <Text style={styles.reviewMeta}>
                  {[
                    [sector, district].filter(Boolean).join(', ') || 'Location not set',
                    propertyType ? PROPERTY_TYPE_LABELS[propertyType] : null,
                    bedrooms === null ? null : bedrooms === 0 ? 'Studio' : `${bedrooms} bed`,
                    furnished ? 'Furnished' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <Text style={styles.reviewMeta}>
                  {images.length} photo{images.length === 1 ? '' : 's'}
                  {pin ? ' · Pin set' : ' · No pin'}
                </Text>
              </View>
            </View>

            {!!progress && <Text style={styles.progressText}>{progress}</Text>}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {stepIndex > 0 && (
          <Button
            label="Back"
            variant="ghost"
            style={styles.flex}
            onPress={goBack}
            disabled={submitting}
          />
        )}
        {step === 'review' ? (
          <Button
            label="Publish listing"
            style={styles.flexTwo}
            onPress={() => void onPublish()}
            loading={submitting}
          />
        ) : (
          <Button label="Continue" style={styles.flexTwo} onPress={goNext} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  progressRow: { flexDirection: 'row', gap: 4, padding: spacing.md },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
  },
  progressBarActive: { backgroundColor: colors.softBlack },

  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  flexTwo: { flex: 2 },
  field: { gap: spacing.sm },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.charcoal },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  help: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  error: { color: colors.danger, fontSize: fontSize.xs },
  textArea: { minHeight: 120, paddingTop: spacing.md, textAlignVertical: 'top' },

  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.lightGray },
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
    backgroundColor: colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  coverText: { fontSize: 10, fontWeight: '700', color: colors.softBlack },

  pickerMap: { width: '100%', height: 240, borderRadius: radius.md },

  reviewCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  reviewImage: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.lightGray },
  reviewBody: { padding: spacing.md, gap: 2 },
  reviewPrice: { fontSize: fontSize.lg, fontWeight: '700', color: colors.softBlack },
  reviewPerMonth: { fontSize: fontSize.sm, fontWeight: '400', color: colors.muted },
  reviewTitle: { fontSize: fontSize.md, color: colors.charcoal },
  reviewMeta: { fontSize: fontSize.sm, color: colors.muted },
  progressText: { fontSize: fontSize.sm, color: colors.charcoal, textAlign: 'center' },

  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
