import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Loading, empty, and error states.
 *
 * These are not filler. The brief targets low-to-medium bandwidth connections,
 * where a request hanging or failing is the normal case rather than the edge
 * case, and an app that shows a spinner forever is indistinguishable from one
 * that is broken.
 */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const t = useT();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.charcoal} />
      <Text style={styles.muted}>{t(label)}</Text>
    </View>
  );
}

/** A soft round mark above the words, so an empty screen reads as a state, not a blank. */
function Mark({ icon, tone }: { icon: keyof typeof Ionicons.glyphMap; tone?: 'danger' }) {
  return (
    <View style={[styles.mark, tone === 'danger' && styles.markDanger]}>
      <Ionicons
        name={icon}
        size={26}
        color={tone === 'danger' ? colors.danger : colors.charcoal}
      />
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon = 'file-tray-outline',
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** The mark names the place: a heart on Saved, a bubble on Messages. */
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const t = useT();
  return (
    <View style={styles.center}>
      <Mark icon={icon} />
      <Text style={styles.title}>{t(title)}</Text>
      <Text style={styles.muted}>{t(message)}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      )}
    </View>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const t = useT();
  const message =
    error instanceof Error ? error.message : t('Something went wrong. Please try again.');

  return (
    <View style={styles.center}>
      <Mark icon="cloud-offline-outline" tone="danger" />
      <Text style={styles.title}>{t('Could not load')}</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry && (
        <Button label="Try again" onPress={onRetry} variant="secondary" style={styles.action} />
      )}
    </View>
  );
}

/** Grey blocks matching the ListingCard silhouette, shown while the feed loads. */
export function ListingCardSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonImage} />
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonLine, { width: '55%' }]} />
        <View style={[styles.skeletonLine, { width: '35%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGray,
    marginBottom: spacing.sm,
  },
  markDanger: { backgroundColor: colors.dangerTint },
  title: { ...type.h2, textAlign: 'center' },
  muted: {
    ...type.meta,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },

  skeletonCard: { marginBottom: spacing.xl, gap: spacing.sm },
  skeletonImage: {
    width: '100%',
    aspectRatio: 5 / 4,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  skeletonBody: { gap: spacing.xs },
  skeletonLine: {
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.lightGray,
  },
});
