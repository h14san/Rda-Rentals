import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { BOOKING_MODE_COPY } from '@/features/bookings/types';
import { useT } from '@/lib/i18n';
import { colors, spacing, type } from '@/theme';

/**
 * How people may book a listing: by asking first, at once, or either.
 *
 * Shared by the post wizard and the edit screen so the two cannot drift, and
 * so the consequences of each choice are explained in the same words in both
 * (§22). The last one cannot be switched off: the database requires at least
 * one, and offering a tap that it would refuse is worse than not offering it.
 */
export function BookingModeFields({
  instantBook,
  requestToBook,
  onChange,
}: {
  instantBook: boolean;
  requestToBook: boolean;
  onChange: (next: { instantBook: boolean; requestToBook: boolean }) => void;
}) {
  const t = useT();
  const rows = [
    {
      mode: 'request' as const,
      on: requestToBook,
      locked: requestToBook && !instantBook,
      toggle: () => onChange({ instantBook, requestToBook: !requestToBook }),
    },
    {
      mode: 'instant' as const,
      on: instantBook,
      locked: instantBook && !requestToBook,
      toggle: () => onChange({ instantBook: !instantBook, requestToBook }),
    },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('How people book')}</Text>
      <Text style={styles.help}>Choose one or both. At least one has to stay on.</Text>
      {rows.map((row) => (
        <View key={row.mode} style={styles.row}>
          <View style={styles.chip}>
            <Chip
              label={`${t(BOOKING_MODE_COPY[row.mode].label)}: ${row.on ? 'on' : 'off'}`}
              selected={row.on}
              onPress={row.locked ? undefined : row.toggle}
            />
          </View>
          <Text style={styles.help}>{BOOKING_MODE_COPY[row.mode].detail}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...type.label, color: colors.charcoal },
  help: type.caption,
  row: { gap: spacing.xs, marginTop: spacing.sm },
  chip: { flexDirection: 'row' },
});
