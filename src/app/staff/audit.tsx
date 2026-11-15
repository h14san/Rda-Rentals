import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { StaffOnly } from '@/components/staff';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Chip } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { AUDIT_ACTION_LABELS, useAuditLog, type AuditEvent } from '@/features/staff/queries';
import { timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

function subjectRoute(e: AuditEvent): Href | null {
  if (e.subject_type === 'user') return `/staff/users/${e.subject_id}`;
  if (e.subject_type === 'listing') return `/staff/listings/${e.subject_id}`;
  if (e.subject_type === 'report') return `/staff/reports/${e.subject_id}`;
  // A conversation has no staff screen of its own: it opens only through an
  // open report.
  return null;
}

/**
 * Who did what, and when: verification and moderation as one read-only list.
 *
 * `?subject=<id>` narrows it to one account or listing (the detail screens
 * link here that way). Tapping a name narrows it to that person's actions.
 */
export default function StaffAuditScreen() {
  const params = useLocalSearchParams<{ subject?: string }>();
  const { isStaff } = useAuth();
  const router = useRouter();
  const subject = params.subject ?? null;
  const [actor, setActor] = useState<{ id: string; name: string } | null>(null);
  const log = useAuditLog(actor?.id ?? null, subject, isStaff);

  if (!isStaff) return <StaffOnly />;
  if (log.isPending) return <LoadingState label="Loading the log…" />;
  if (log.isError) return <ErrorState error={log.error} onRetry={() => void log.refetch()} />;

  return (
    <FlatList
      data={log.data}
      keyExtractor={(e) => `${e.source}-${e.event_id}`}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={log.isRefetching} onRefresh={() => void log.refetch()} />
      }
      ListHeaderComponent={
        subject || actor ? (
          <View style={styles.filters}>
            {subject && (
              <Chip label="One subject · show all" selected onPress={() => router.setParams({ subject: undefined })} />
            )}
            {actor && (
              <Chip label={`By ${actor.name} · clear`} selected onPress={() => setActor(null)} />
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState title="Nothing recorded" message="No actions match this filter." />
      }
      renderItem={({ item }) => {
        const route = subjectRoute(item);
        return (
          <View style={styles.row}>
            <Text style={styles.caption}>{timeAgo(item.at)}</Text>
            <Text style={styles.title}>
              {AUDIT_ACTION_LABELS[item.action] ?? item.action}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!item.actor}
              onPress={() =>
                item.actor &&
                setActor({ id: item.actor, name: item.actor_name ?? 'this person' })
              }
            >
              <Text style={styles.link}>
                {item.actor ? `by ${item.actor_name ?? 'unnamed'}` : 'by the system'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!route}
              onPress={() => route && router.push(route)}
            >
              <Text style={route ? styles.link : styles.meta}>
                {item.subject_type}: {item.subject_label ?? 'no longer exists'}
              </Text>
            </Pressable>
            {!!item.note && <Text style={styles.meta}>{item.note}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  row: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  caption: type.caption,
  title: type.bodyStrong,
  meta: type.meta,
  link: { ...type.meta, color: colors.softBlack, textDecorationLine: 'underline' },
});
