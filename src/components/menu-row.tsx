import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/theme';

/** A titled group of MenuRows, with hairlines between the rows only. */
export function MenuSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {!!title && <Text style={styles.sectionTitle}>{title}</Text>}
      <View>{children}</View>
    </View>
  );
}

/**
 * One line of a settings-style menu: icon, label, an optional quiet detail on
 * the right, and a chevron. The profile tab is built from these, so that it is
 * a list of places to go rather than a page of everything at once.
 */
export function MenuRow({
  icon,
  label,
  detail,
  onPress,
  destructive,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
  /** A small dot: something here is waiting for the user. */
  badge?: boolean;
}) {
  const tint = destructive ? colors.danger : colors.softBlack;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={22} color={tint} />
      <Text style={[styles.label, destructive && { color: colors.danger }]} numberOfLines={1}>
        {label}
      </Text>
      {badge && <View style={styles.dot} />}
      {!!detail && (
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      )}
      {!destructive && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  sectionTitle: { ...type.h2, marginBottom: spacing.xs },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: { ...type.body, flex: 1, color: colors.softBlack },
  detail: { ...type.meta, maxWidth: '45%' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.softBlack },
});
