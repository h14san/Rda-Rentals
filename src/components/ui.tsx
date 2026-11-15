import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/text';
import { useT } from '@/lib/i18n';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  icon?: ReactNode;
}

/**
 * Filled shapes, no outlines. One solid primary per screen; everything else is
 * a quiet tinted fill, so the eye lands on the action that matters. Danger is
 * a red tint rather than a red slab: it should read as "careful", not shout
 * from every listing card.
 */
const BUTTON_COLORS: Record<ButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.softBlack, fg: colors.white },
  secondary: { bg: colors.lightGray, fg: colors.softBlack },
  ghost: { bg: 'transparent', fg: colors.charcoal },
  danger: { bg: colors.dangerTint, fg: colors.danger },
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
  const t = useT();
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
          opacity: inactive ? 0.45 : 1,
          // A slight press-in instead of a fade: the button feels physical
          // without an animation library on the path of every tap.
          transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonLabel, { color: palette.fg }]}>{t(label)}</Text>
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
  const t = useT();
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
        {t(label)}
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
  /**
   * Control shown on the label row, right-aligned — e.g. the "Write it for me"
   * action beside Description. It sits with the label rather than above the
   * field so it reads as being about that field, and so it cannot be mistaken
   * for part of the value being edited.
   */
  accessory?: ReactNode;
}

export function TextField({
  label,
  error,
  hint,
  style,
  accessory,
  placeholder,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const t = useT();
  // A filled field with no outline at rest, and a dark outline only while it
  // has focus: the one field being typed in is the one that stands out.
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{t(label)}</Text>
        {accessory}
      </View>
      <TextInput
        placeholderTextColor={colors.muted}
        placeholder={placeholder ? t(placeholder) : undefined}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
        {...rest}
      />
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
      {!error && !!hint && <Text style={styles.fieldHint}>{t(hint)}</Text>}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Section heading                                                            */
/* -------------------------------------------------------------------------- */

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <Text style={styles.sectionTitle}>
      {typeof children === 'string' ? t(children) : children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    letterSpacing: -0.1,
  },

  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
  },
  chipSelected: { backgroundColor: colors.softBlack },
  chipLabel: { ...type.label, color: colors.charcoal },
  chipLabelSelected: { color: colors.white },

  fieldWrap: { gap: spacing.sm },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldLabel: { ...type.label, color: colors.softBlack },
  input: {
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.softBlack,
    backgroundColor: colors.lightGray,
  },
  inputFocused: { borderColor: colors.softBlack, backgroundColor: colors.white },
  inputError: { borderColor: colors.danger },
  fieldError: {
    ...type.caption,
    color: colors.danger,
  },
  fieldHint: type.caption,

  sectionTitle: {
    ...type.h2,
    marginBottom: spacing.xs,
  },
});
