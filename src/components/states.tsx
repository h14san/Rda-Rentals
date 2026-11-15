import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const t = useT();
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{t(title)}</Text>
      <Text style={styles.muted}>{t(message)}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
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
      <Text style={styles.title}>{t('Could not load')}</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry && <Button label="Try again" onPress={onRetry} variant="secondary" />}
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
  title: type.h2,
  muted: {
    ...type.meta,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

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
