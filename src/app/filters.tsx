import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, SectionTitle } from '@/components/ui';
import { useFilters } from '@/features/listings/filters-context';
import {
  EMPTY_FILTERS,
  PRICE_BOUNDS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type Filters,
} from '@/features/listings/types';
import { formatPriceCompact } from '@/lib/format';
import { KIGALI_DISTRICTS, sectorsFor } from '@/lib/locations';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

const BEDROOM_OPTIONS = [0, 1, 2, 3, 4] as const;

/**
 * Filter sheet.
 *
 * Edits a local draft and only commits on "Show results", so a half-set filter
 * never triggers a query — each intermediate state would otherwise be a round
 * trip on a metered connection.
 */
export default function FiltersScreen() {
  const router = useRouter();
  const { filters, setFilters } = useFilters();
  const [draft, setDraft] = useState<Filters>(filters);

  const minPrice = draft.minPrice ?? PRICE_BOUNDS.min;
  const maxPrice = draft.maxPrice ?? PRICE_BOUNDS.max;
  const sectors = sectorsFor(draft.district);

  const priceIsSet = draft.minPrice !== null || draft.maxPrice !== null;
  const priceLabel = !priceIsSet
    ? 'Any price'
    : draft.maxPrice === null
      ? `From ${formatPriceCompact(minPrice)}`
      : draft.minPrice === null
        ? `Up to ${formatPriceCompact(maxPrice)}`
        : `${formatPriceCompact(minPrice)} — ${formatPriceCompact(maxPrice)}`;

  function patch(next: Partial<Filters>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  function apply() {
    setFilters(draft);
    router.back();
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionTitle>Price per month</SectionTitle>
          <View style={styles.priceHeader}>
            <Text style={styles.priceReadout}>{priceLabel}</Text>
            {priceIsSet && (
              <Pressable
                onPress={() => patch({ minPrice: null, maxPrice: null })}
                accessibilityRole="button"
              >
                <Text style={styles.clearLink}>Clear</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.sliderLabel}>Minimum</Text>
          <Slider
            minimumValue={PRICE_BOUNDS.min}
            maximumValue={PRICE_BOUNDS.max}
            step={PRICE_BOUNDS.step}
            value={minPrice}
            minimumTrackTintColor={colors.softBlack}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.softBlack}
            // Only ever write the bound being dragged. Writing both would turn
            // an untouched (null) maximum into a real 1,000,000 filter just
            // because the minimum moved, quietly excluding nothing while
            // showing up as an extra active filter.
            onSlidingComplete={(v) => patch({ minPrice: Math.min(v, maxPrice) })}
          />

          <Text style={styles.sliderLabel}>Maximum</Text>
          <Slider
            minimumValue={PRICE_BOUNDS.min}
            maximumValue={PRICE_BOUNDS.max}
            step={PRICE_BOUNDS.step}
            value={maxPrice}
            minimumTrackTintColor={colors.softBlack}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.softBlack}
            onSlidingComplete={(v) => patch({ maxPrice: Math.max(v, minPrice) })}
          />
        </View>

        <View style={styles.section}>
          <SectionTitle>District</SectionTitle>
          <View style={styles.chipWrap}>
            {KIGALI_DISTRICTS.map((district) => (
              <Chip
                key={district}
                label={district}
                selected={draft.district === district}
                onPress={() =>
                  patch(
                    draft.district === district
                      ? { district: null, sector: null }
                      : // Changing district invalidates any sector chosen under
                        // the previous one.
                        { district, sector: null },
                  )
                }
              />
            ))}
          </View>
        </View>

        {sectors.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Sector</SectionTitle>
            <View style={styles.chipWrap}>
              {sectors.map((sector) => (
                <Chip
                  key={sector}
                  label={sector}
                  selected={draft.sector === sector}
                  onPress={() =>
                    patch({ sector: draft.sector === sector ? null : sector })
                  }
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <SectionTitle>Property type</SectionTitle>
          <View style={styles.chipWrap}>
            {PROPERTY_TYPES.map((type) => (
              <Chip
                key={type}
                label={PROPERTY_TYPE_LABELS[type]}
                selected={draft.propertyType === type}
                onPress={() =>
                  patch({
                    propertyType: draft.propertyType === type ? null : type,
                  })
                }
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle>Bedrooms</SectionTitle>
          <View style={styles.chipWrap}>
            {BEDROOM_OPTIONS.map((n) => (
              <Chip
                key={n}
                label={n === 0 ? 'Studio' : `${n}+`}
                selected={draft.minBedrooms === n}
                onPress={() =>
                  patch({ minBedrooms: draft.minBedrooms === n ? null : n })
                }
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle>Furnishing</SectionTitle>
          <View style={styles.chipWrap}>
            <Chip
              label="Furnished only"
              selected={draft.furnishedOnly}
              onPress={() => patch({ furnishedOnly: !draft.furnishedOnly })}
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Clear all"
          variant="ghost"
          onPress={() => setDraft(EMPTY_FILTERS)}
          style={styles.footerButton}
        />
        <Button label="Show results" onPress={apply} style={styles.footerButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  priceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceReadout: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semibold,
    color: colors.softBlack,
  },
  clearLink: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    color: colors.muted,
  },
  sliderLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  footerButton: { flex: 1 },
});
