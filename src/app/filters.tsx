import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { RangeSlider } from '@/components/range-slider';
import { Button, Chip } from '@/components/ui';
import { useFilters } from '@/features/listings/filters-context';
import { moveInOptions } from '@/features/listings/terms-fields';
import {
  EMPTY_FILTERS,
  PRICE_BOUNDS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  formatShortDate,
  type Filters,
} from '@/features/listings/types';
import { AMENITIES, AMENITY_LABELS, type Amenity } from '@/lib/amenities';
import { formatPrice } from '@/lib/format';
import { KIGALI_DISTRICTS, sectorsFor } from '@/lib/locations';
import { colors, spacing, type } from '@/theme';

const BEDROOM_OPTIONS = [0, 1, 2, 3, 4] as const;
const BATHROOM_OPTIONS = [1, 2, 3] as const;
/** "I can commit to at most N months." Matches the landlord-side choices. */
const STAY_OPTIONS = [1, 3, 6, 12] as const;

/** How many of the filters behind "More filters" are set. */
function moreCount(f: Filters): number {
  return [
    f.minBathrooms !== null,
    f.amenities.length > 0,
    f.maxMinRentalMonths !== null,
    f.availableBy !== null,
  ].filter(Boolean).length;
}

/**
 * Filter sheet.
 *
 * The five filters nearly everyone uses come first: price, type, bedrooms,
 * area, furnished. The rest are behind "More filters", so the sheet is one
 * screen tall for most people instead of four.
 *
 * Edits a local draft and only commits on "Show results", so a half-set filter
 * never triggers a query — each intermediate state would otherwise be a round
 * trip on a metered connection.
 *
 * "Clear all" is the exception and commits at once. Clearing is a decision, not
 * a half-set filter, and having to press "Show results" afterwards to make it
 * stick read as the button not working: going back showed the old filters.
 */
export default function FiltersScreen() {
  const router = useRouter();
  const { filters, setFilters, resetFilters } = useFilters();
  const [draft, setDraft] = useState<Filters>(filters);
  // Open from the start when one of them is already set, so a filter in force
  // is never hidden behind a closed section.
  const [showMore, setShowMore] = useState(moreCount(filters) > 0);

  const sectors = sectorsFor(draft.district);
  const hidden = moreCount(draft);

  function patch(next: Partial<Filters>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  function toggleAmenity(a: Amenity) {
    patch({
      amenities: draft.amenities.includes(a)
        ? draft.amenities.filter((x) => x !== a)
        : [...draft.amenities, a],
    });
  }

  function apply() {
    setFilters(draft);
    router.back();
  }

  function clearAll() {
    setDraft(EMPTY_FILTERS);
    // Also drops the smart-search explanation, which described these filters.
    resetFilters();
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.heading}>Price per month</Text>
          <RangeSlider
            min={PRICE_BOUNDS.min}
            max={PRICE_BOUNDS.max}
            step={PRICE_BOUNDS.step}
            low={draft.minPrice ?? PRICE_BOUNDS.min}
            high={draft.maxPrice ?? PRICE_BOUNDS.max}
            // A handle resting on its end of the bar means "no limit on this
            // side", and is stored as null. Storing the bound itself would
            // quietly hide every listing above 1,000,000 and count as a filter
            // the renter never set.
            onChange={(low, high) =>
              patch({
                minPrice: low <= PRICE_BOUNDS.min ? null : low,
                maxPrice: high >= PRICE_BOUNDS.max ? null : high,
              })
            }
            format={(value, end) =>
              end === 'high' && value >= PRICE_BOUNDS.max
                ? 'Any'
                : end === 'low' && value <= PRICE_BOUNDS.min
                  ? 'Any'
                  : formatPrice(value)
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Type of place</Text>
          <View style={styles.chipWrap}>
            {PROPERTY_TYPES.map((t) => (
              <Chip
                key={t}
                label={PROPERTY_TYPE_LABELS[t]}
                selected={draft.propertyType === t}
                onPress={() => patch({ propertyType: draft.propertyType === t ? null : t })}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Bedrooms</Text>
          <View style={styles.chipWrap}>
            {BEDROOM_OPTIONS.map((n) => (
              <Chip
                key={n}
                label={n === 0 ? 'Studio' : `${n}+`}
                selected={draft.minBedrooms === n}
                onPress={() => patch({ minBedrooms: draft.minBedrooms === n ? null : n })}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Area</Text>
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
          {sectors.length > 0 && (
            <>
              <Text style={styles.subheading}>Sector in {draft.district}</Text>
              <View style={styles.chipWrap}>
                {sectors.map((sector) => (
                  <Chip
                    key={sector}
                    label={sector}
                    selected={draft.sector === sector}
                    onPress={() => patch({ sector: draft.sector === sector ? null : sector })}
                  />
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Furnishing</Text>
          <View style={styles.chipWrap}>
            <Chip
              label="Furnished only"
              selected={draft.furnishedOnly}
              onPress={() => patch({ furnishedOnly: !draft.furnishedOnly })}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showMore }}
          onPress={() => setShowMore((v) => !v)}
          style={({ pressed }) => [styles.moreToggle, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.moreLabel}>
            {showMore ? 'Fewer filters' : 'More filters'}
            {hidden > 0 ? ` (${hidden} set)` : ''}
          </Text>
          <Ionicons
            name={showMore ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.softBlack}
          />
        </Pressable>

        {showMore && (
          <>
            <View style={styles.section}>
              <Text style={styles.heading}>Bathrooms</Text>
              <View style={styles.chipWrap}>
                {BATHROOM_OPTIONS.map((n) => (
                  <Chip
                    key={n}
                    label={`${n}+`}
                    selected={draft.minBathrooms === n}
                    onPress={() => patch({ minBathrooms: draft.minBathrooms === n ? null : n })}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.heading}>Amenities</Text>
              <View style={styles.chipWrap}>
                {AMENITIES.map((a) => (
                  <Chip
                    key={a}
                    label={AMENITY_LABELS[a]}
                    selected={draft.amenities.includes(a)}
                    onPress={() => toggleAmenity(a)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.heading}>Longest lease you can commit to</Text>
              <View style={styles.chipWrap}>
                {STAY_OPTIONS.map((n) => (
                  <Chip
                    key={n}
                    label={n === 1 ? '1 month' : `${n} months`}
                    selected={draft.maxMinRentalMonths === n}
                    onPress={() =>
                      patch({ maxMinRentalMonths: draft.maxMinRentalMonths === n ? null : n })
                    }
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.heading}>Move in by</Text>
              <View style={styles.chipWrap}>
                {moveInOptions().map((d) => (
                  <Chip
                    key={d}
                    label={formatShortDate(d)}
                    selected={draft.availableBy === d}
                    onPress={() => patch({ availableBy: draft.availableBy === d ? null : d })}
                  />
                ))}
              </View>
              <Text style={styles.caption}>
                Listings without a stated date are always included.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Clear all" variant="ghost" onPress={clearAll} style={styles.footerButton} />
        <Button label="Show results" onPress={apply} style={styles.footerButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm + 4 },
  heading: type.bodyStrong,
  subheading: { ...type.meta, marginTop: spacing.xs },
  caption: type.caption,
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  moreLabel: type.bodyStrong,
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
