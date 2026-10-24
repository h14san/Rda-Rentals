import { StyleSheet, Text, View } from 'react-native';

import { Chip, TextField } from '@/components/ui';
import type { ListingTerms } from '@/features/listings/create';
import { formatShortDate } from '@/features/listings/types';
import { AMENITIES, AMENITY_LABELS, knownAmenities, type Amenity } from '@/lib/amenities';
import { formatPrice } from '@/lib/format';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

const BATHROOM_OPTIONS = [1, 2, 3, 4] as const;
const MIN_STAY_OPTIONS = [1, 3, 6, 12] as const;

/** Mirrors the size_sqm check constraint, so the form refuses what the database would. */
const SIZE_BOUNDS = { min: 5, max: 5000 } as const;

/** Local calendar date as YYYY-MM-DD. toISOString would shift it to UTC first. */
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Move-in choices: now, or the 1st of one of the next three months.
 *
 * Chips rather than a date picker: Kigali leases overwhelmingly start on the
 * 1st, a picker would be a new native dependency, and a typed date is the
 * input most likely to be wrong on a phone keyboard.
 */
export function moveInOptions(today = new Date()): string[] {
  return [1, 2, 3].map((offset) =>
    isoDate(new Date(today.getFullYear(), today.getMonth() + offset, 1)),
  );
}

const digitsOrNull = (text: string): number | null => {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
};

/** Field errors for the terms, keyed like the screens' own error maps. */
export function validateTerms(terms: ListingTerms): Record<string, string> {
  const errors: Record<string, string> = {};
  if (
    terms.size_sqm !== null &&
    (terms.size_sqm < SIZE_BOUNDS.min || terms.size_sqm > SIZE_BOUNDS.max)
  ) {
    errors.size = `Enter a size between ${SIZE_BOUNDS.min} and ${SIZE_BOUNDS.max} m².`;
  }
  return errors;
}

/**
 * The structured rental terms, shared by the post wizard and the edit form so
 * the two cannot drift. Every field is optional: an unstated term still
 * matches renters' filters (see useListingsFeed), so leaving one blank never
 * hides a listing.
 */
export function ListingTermsFields({
  terms,
  onChange,
  errors,
}: {
  terms: ListingTerms;
  onChange: (next: ListingTerms) => void;
  errors: Record<string, string>;
}) {
  const patch = (next: Partial<ListingTerms>) => onChange({ ...terms, ...next });
  const amenities = knownAmenities(terms.amenities);

  // An edited listing may carry a date that is no longer one of the next three
  // 1sts. It stays visible and selected rather than silently disappearing.
  const dates = moveInOptions();
  if (terms.available_from && !dates.includes(terms.available_from)) {
    dates.unshift(terms.available_from);
  }

  function toggleAmenity(a: Amenity) {
    patch({
      amenities: amenities.includes(a)
        ? amenities.filter((x) => x !== a)
        : [...amenities, a],
    });
  }

  return (
    <View style={styles.section}>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Bathrooms</Text>
        <View style={styles.chipWrap}>
          {BATHROOM_OPTIONS.map((n) => (
            <Chip
              key={n}
              label={n === 4 ? '4+' : String(n)}
              selected={terms.bathrooms === n}
              onPress={() => patch({ bathrooms: terms.bathrooms === n ? null : n })}
            />
          ))}
        </View>
      </View>

      <TextField
        label="Size (m²)"
        value={terms.size_sqm === null ? '' : String(terms.size_sqm)}
        onChangeText={(t) => patch({ size_sqm: digitsOrNull(t) })}
        error={errors.size}
        placeholder="Optional"
        keyboardType="number-pad"
      />

      <TextField
        label="Deposit (RWF)"
        value={terms.deposit_rwf === null ? '' : String(terms.deposit_rwf)}
        onChangeText={(t) => patch({ deposit_rwf: digitsOrNull(t) })}
        hint={
          terms.deposit_rwf !== null && terms.deposit_rwf > 0
            ? formatPrice(terms.deposit_rwf)
            : 'Leave blank if there is no deposit to state.'
        }
        placeholder="Optional"
        keyboardType="number-pad"
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Minimum stay</Text>
        <View style={styles.chipWrap}>
          {MIN_STAY_OPTIONS.map((n) => (
            <Chip
              key={n}
              label={n === 1 ? '1 month' : `${n} months`}
              selected={terms.min_rental_months === n}
              onPress={() =>
                patch({ min_rental_months: terms.min_rental_months === n ? null : n })
              }
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Available from</Text>
        <View style={styles.chipWrap}>
          <Chip
            label="Now"
            selected={terms.available_from === null}
            onPress={() => patch({ available_from: null })}
          />
          {dates.map((d) => (
            <Chip
              key={d}
              label={formatShortDate(d)}
              selected={terms.available_from === d}
              onPress={() => patch({ available_from: d })}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Amenities</Text>
        <View style={styles.chipWrap}>
          {AMENITIES.map((a) => (
            <Chip
              key={a}
              label={AMENITY_LABELS[a]}
              selected={amenities.includes(a)}
              onPress={() => toggleAmenity(a)}
            />
          ))}
        </View>
        <Text style={styles.help}>
          Only tick what the place really has. Renters filter on these.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  field: { gap: spacing.sm },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.semibold,
    color: colors.charcoal,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  help: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.muted,
  },
});
