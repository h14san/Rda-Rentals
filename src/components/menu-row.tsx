import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { useT } from '@/lib/i18n';
import { colors, radius, spacing, type } from '@/theme';

/**
 * A titled group of MenuRows on one soft card. Grouping by card, rather than
 * by a long ruled list, is what lets the profile read as three short lists.
 */
export function MenuSection({ title, children }: { title?: string; children: ReactNode }) {
  const t = useT();
  return (
    <View style={styles.section}>
      {!!title && <Text style={styles.sectionTitle}>{t(title)}</Text>}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/**
 * One line of a settings-style menu: an icon in a small tile, a label, an
 * optional quiet detail on the right, and a chevron. The profile tab is built
 * from these, so that it is a list of places to go rather than a page of
 * everything at once.
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
  const t = useT();
  const tint = destructive ? colors.danger : colors.softBlack;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconTile, destructive && styles.iconTileDanger]}>
        <Ionicons name={icon} size={19} color={tint} />
      </View>
      <Text style={[styles.label, destructive && { color: colors.danger }]} numberOfLines={1}>
        {t(label)}
      </Text>
      {badge && <View style={styles.dot} />}
      {!!detail && (
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      )}
      {!destructive && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: { ...type.caption, textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: spacing.xs },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: colors.lightGray },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGray,
  },
  iconTileDanger: { backgroundColor: colors.dangerTint },
  label: { ...type.body, flex: 1, color: colors.softBlack },
  detail: { ...type.meta, maxWidth: '45%' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.softBlack },
});
