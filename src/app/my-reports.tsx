import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useAuth } from '@/features/auth/context';
import { useMyReports } from '@/features/moderation/queries';
import {
  REPORT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
} from '@/features/moderation/types';
import { timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

/** The reporter's own reports and what came of each (Features #24). */
export default function MyReportsScreen() {
  const { session } = useAuth();
  const reports = useMyReports(session?.user.id ?? '');

  if (!session) return null;
  if (reports.isPending) return <LoadingState label="Loading your reports…" />;
  if (reports.isError)
    return <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />;

  return (
    <FlatList
      data={reports.data}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={reports.isRefetching}
          onRefresh={() => void reports.refetch()}
        />
      }
      ListEmptyComponent={
        <EmptyState
          title="No reports"
          message="If a listing or a person looks wrong, report it from their page and it will show up here."
        />
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.caption}>
            {REPORT_TARGET_LABELS[item.target_type]} · sent {timeAgo(item.created_at)}
          </Text>
          <Text style={styles.title}>{REPORT_REASON_LABELS[item.reason]}</Text>
          {!!item.note && (
            <Text style={styles.meta} numberOfLines={3}>
              {item.note}
            </Text>
          )}
          <View style={styles.result}>
            <Text style={styles.resultTitle}>{REPORT_STATUS_LABELS[item.status]}</Text>
            {!!item.action_taken && (
              <Text style={styles.meta}>{REPORT_ACTION_LABELS[item.action_taken]}</Text>
            )}
            {!!item.resolution_note && <Text style={styles.meta}>{item.resolution_note}</Text>}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  caption: type.caption,
  title: type.bodyStrong,
  meta: type.meta,
  result: {
    gap: 2,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  resultTitle: type.label,
});
