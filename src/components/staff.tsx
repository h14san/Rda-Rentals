import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { EmptyState } from '@/components/states';
import { colors, radius, spacing, type } from '@/theme';

/** Small pieces the staff console screens share. */

/**
 * Shown in place of any staff screen to a non-staff user. Presentation only:
 * the data behind every staff screen is refused by RLS or a checked function.
 */
export function StaffOnly() {
  return <EmptyState title="Staff only" message="This page is for Rwanda Rentals staff." />;
}

/** A tappable row with a caption line, a title and a meta line. */
export function StaffRow({
  caption,
  title,
  meta,
  onPress,
  right,
}: {
  caption?: string;
  title: string;
  meta?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.rowText}>
        {!!caption && <Text style={styles.caption}>{caption}</Text>}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {!!meta && (
          <Text style={styles.meta} numberOfLines={3}>
            {meta}
          </Text>
        )}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  rowText: { flex: 1, gap: 2 },
  caption: type.caption,
  title: type.bodyStrong,
  meta: type.meta,
});
