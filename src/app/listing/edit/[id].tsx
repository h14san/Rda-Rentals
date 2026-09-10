import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ErrorState, LoadingState } from '@/components/states';
import { Button, Chip, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useListingDetail, useUpdateListing } from '@/features/listings/queries';
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type PropertyType,
} from '@/features/listings/types';
import { formatPrice } from '@/lib/format';
import { KIGALI_DISTRICTS, sectorsFor } from '@/lib/locations';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

/**
 * Edit an existing listing.
 *
 * A flat form rather than the four-step wizard used for posting: the wizard
 * exists to break a long first-time task into digestible pieces, but editing is
 * usually a single correction — a wrong price, a typo — and making someone page
 * through four screens to fix one field is worse than showing them everything.
 *
 * Photos are deliberately not editable here yet; the upload/ordering flow needs
 * more than a field form, and the common edit is textual.
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

    try {
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
      Alert.alert(
        'Could not save',
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
    }
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

        <Text style={styles.note}>
          Photos cannot be changed here yet. Delete and repost the listing to replace
          them.
        </Text>
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
  note: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.muted,
    lineHeight: 18,
  },
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
