import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'whatsapp' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  icon?: ReactNode;
}

const BUTTON_COLORS: Record<
  ButtonVariant,
  { bg: string; fg: string; border?: string }
> = {
  primary: { bg: colors.softBlack, fg: colors.white },
  secondary: { bg: colors.white, fg: colors.charcoal, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.charcoal },
  whatsapp: { bg: colors.whatsapp, fg: colors.white },
  danger: { bg: colors.white, fg: colors.danger, border: colors.danger },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  icon,
}: ButtonProps) {
  const palette = BUTTON_COLORS[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border ?? 'transparent',
          borderWidth: palette.border ? 1 : 0,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonLabel, { color: palette.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Chip — filter pills and tags                                               */
/* -------------------------------------------------------------------------- */

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* TextField                                                                  */
/* -------------------------------------------------------------------------- */

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

export function TextField({ label, error, hint, style, ...rest }: TextFieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, !!error && styles.inputError, style]}
        {...rest}
      />
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
      {!error && !!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Section heading                                                            */
/* -------------------------------------------------------------------------- */

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonLabel: {
    ...type.label,
    fontSize: fontSize.md,
  },

  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipSelected: {
    backgroundColor: colors.softBlack,
    borderColor: colors.softBlack,
  },
  chipLabel: type.label,
  chipLabelSelected: { color: colors.white },

  fieldWrap: { gap: spacing.xs },
  fieldLabel: type.label,
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.softBlack,
    backgroundColor: colors.white,
  },
  inputError: { borderColor: colors.danger },
  fieldError: {
    ...type.caption,
    color: colors.danger,
  },
  fieldHint: type.caption,

  sectionTitle: {
    ...type.h2,
    marginBottom: spacing.sm,
  },
});
