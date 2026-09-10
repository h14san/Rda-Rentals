import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { colors, fontSize, radius, spacing } from '@/theme';

/**
 * Loading, empty, and error states.
 *
 * These are not filler. The brief targets low-to-medium bandwidth connections,
 * where a request hanging or failing is the normal case rather than the edge
 * case, and an app that shows a spinner forever is indistinguishable from one
 * that is broken.
 */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.charcoal} />
      <Text style={styles.muted}>{label}</Text>
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
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>{message}</Text>
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
  const message =
    error instanceof Error ? error.message : 'Something went wrong. Please try again.';

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Could not load</Text>
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
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.softBlack },
  muted: {
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  skeletonCard: { marginBottom: spacing.lg, gap: spacing.sm },
  skeletonImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  skeletonBody: { gap: spacing.xs },
  skeletonLine: { height: 14, borderRadius: radius.sm, backgroundColor: colors.lightGray },
});
