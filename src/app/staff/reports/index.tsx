import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Chip } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useReportsQueue } from '@/features/moderation/queries';
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  SEVERITY_LABELS,
  type ReportStatus,
} from '@/features/moderation/types';
import { timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

/** Open work first; closed reports are kept reachable for looking back. */
const GROUPS: { status: ReportStatus; label: string }[] = [
  { status: 'open', label: 'New' },
  { status: 'in_review', label: 'In review' },
  { status: 'resolved', label: 'Resolved' },
  { status: 'dismissed', label: 'Dismissed' },
];

/**
 * Staff reports queue, grouped by status, most severe then oldest first.
 *
 * As with the review queue, hiding it from non-staff is presentation only:
 * RLS returns a non-staff caller nothing but their own reports.
 */
export default function ReportsQueueScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();
  // ?flagged=1 is the "Flagged messages" queue: the same table, narrowed to
  // the reports the message trigger files on its own (no reporter).
  const { flagged } = useLocalSearchParams<{ flagged?: string }>();
  const onlyFlags = flagged === '1';
  const [status, setStatus] = useState<ReportStatus>('open');
  const queue = useReportsQueue(isStaff);

  if (!isStaff) {
    return <EmptyState title="Staff only" message="Reports are handled by Rwanda Rentals staff." />;
  }
  if (queue.isPending) return <LoadingState label="Loading reports…" />;
  if (queue.isError)
    return <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />;

  const scoped = queue.data.filter((r) => (r.reporter_id === null) === onlyFlags);
  const items = scoped.filter((r) => r.status === status);

  return (
    <FlatList
      data={items}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={queue.isRefetching} onRefresh={() => void queue.refetch()} />
      }
      ListHeaderComponent={
        <View style={styles.filters}>
          <Stack.Screen options={{ title: onlyFlags ? 'Flagged messages' : 'Reports' }} />
          {GROUPS.map((g) => {
            const count = scoped.filter((r) => r.status === g.status).length;
            return (
              <Chip
                key={g.status}
                label={count > 0 ? `${g.label} (${count})` : g.label}
                selected={status === g.status}
                onPress={() => setStatus(g.status)}
              />
            );
          })}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title="Nothing here"
          message={`No reports are ${REPORT_STATUS_LABELS[status].toLowerCase()} right now.`}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/staff/reports/${item.id}`)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.rowTop}>
            <Text style={styles.kind}>{REPORT_TARGET_LABELS[item.target_type]}</Text>
            {item.severity && (
              <Text style={[styles.kind, item.severity === 'high' && styles.high]}>
                {SEVERITY_LABELS[item.severity]}
              </Text>
            )}
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {REPORT_REASON_LABELS[item.reason]}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.reporter_id === null
              ? 'Flagged automatically'
              : `by ${item.reporter?.full_name ?? 'unknown'}`}{' '}
            · {timeAgo(item.created_at)}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  row: {
    gap: 2,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  kind: type.caption,
  high: { color: colors.danger },
  title: type.bodyStrong,
  meta: type.meta,
});
