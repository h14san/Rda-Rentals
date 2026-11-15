import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { ACCOUNT_MODES, ACCOUNT_MODE_COPY, type AccountMode } from '@/features/auth/mode';
import { colors, radius, spacing, type } from '@/theme';

/** Three large choices, used at account setup and again on Edit profile. */
export function ModePicker({
  value,
  onChange,
}: {
  value: AccountMode | null;
  onChange: (next: AccountMode) => void;
}) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {ACCOUNT_MODES.map((mode) => {
        const copy = ACCOUNT_MODE_COPY[mode];
        const selected = value === mode;
        return (
          <Pressable
            key={mode}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(mode)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.selected,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name={copy.icon} size={24} color={colors.softBlack} />
            <View style={styles.text}>
              <Text style={styles.label}>{copy.label}</Text>
              <Text style={styles.detail}>{copy.detail}</Text>
            </View>
            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selected ? colors.softBlack : colors.border}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  selected: { borderColor: colors.softBlack, borderWidth: 2, padding: spacing.md - 1 },
  text: { flex: 1, gap: 2 },
  label: type.bodyStrong,
  detail: type.meta,
});
