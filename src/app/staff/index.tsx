import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StaffOnly, StaffRow } from '@/components/staff';
import { ErrorState, LoadingState } from '@/components/states';
import { SectionTitle } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
  formatShortDate,
} from '@/features/listings/types';
import { useStaffStats } from '@/features/staff/queries';
import { colors, radius, spacing, type } from '@/theme';

/**
 * The staff console's front page: what is waiting, where to go, and the counts.
 *
 * In the app rather than a separate web console (owner decision, 2026-11-12).
 * Stronger staff sign-in (Features #63) is not built; staff use the same
 * one-time code as everyone else.
 */
export default function StaffHubScreen() {
  const { isStaff, roles } = useAuth();
  const router = useRouter();
  const stats = useStaffStats(isStaff);
  const isAdmin = roles.includes('admin');

  if (!isStaff) return <StaffOnly />;
  if (stats.isPending) return <LoadingState label="Loading the console…" />;
  if (stats.isError)
    return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;

  const s = stats.data;
  const chevron = <Ionicons name="chevron-forward" size={18} color={colors.muted} />;
  const waiting = (n: number) => (n === 0 ? 'Nothing waiting' : `${n} waiting`);
  const go = (href: Href) => () => router.push(href);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()} />
      }
    >
      <View style={styles.section}>
        <SectionTitle>Queues</SectionTitle>
        <StaffRow
          title="Verification"
          meta={waiting(s.open_cases)}
          onPress={go('/review')}
          right={chevron}
        />
        <StaffRow
          title="Reports"
          meta={waiting(s.open_reports)}
          onPress={go('/staff/reports')}
          right={chevron}
        />
        <StaffRow
          title="Flagged messages"
          meta={waiting(s.open_flags)}
          onPress={go({ pathname: '/staff/reports', params: { flagged: '1' } })}
          right={chevron}
        />
      </View>

      <View style={styles.section}>
        <SectionTitle>Look up</SectionTitle>
        <StaffRow
          title="Bookings"
          meta="Look one up, or cancel one that should not stand"
          onPress={go('/staff/bookings')}
          right={chevron}
        />
        <StaffRow
          title="Users"
          meta={`${s.users} accounts · ${s.suspended_accounts} suspended`}
          onPress={go('/staff/users')}
          right={chevron}
        />
        <StaffRow
          title="Listings"
          meta="Every status, not only live ones"
          onPress={go('/staff/listings')}
          right={chevron}
        />
        <StaffRow
          title="Audit log"
          meta="Who did what, and when"
          onPress={go('/staff/audit')}
          right={chevron}
        />
        {isAdmin && (
          <StaffRow
            title="Staff roles"
            meta="Who can review and moderate"
            onPress={go('/staff/roles')}
            right={chevron}
          />
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>Listings by status</SectionTitle>
        <View style={styles.grid}>
          {LISTING_STATUSES.map((status) => (
            <View key={status} style={styles.stat}>
              <Text style={styles.statNumber}>{s.listings_by_status[status] ?? 0}</Text>
              <Text style={styles.caption}>{LISTING_STATUS_LABELS[status]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>New each week</SectionTitle>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.caption, styles.wide]}>Week of</Text>
            <Text style={[styles.caption, styles.num]}>Users</Text>
            <Text style={[styles.caption, styles.num]}>Conversations</Text>
          </View>
          {s.weekly.map((w) => (
            <View key={w.week} style={styles.tableRow}>
              <Text style={[styles.meta, styles.wide]}>{formatShortDate(w.week)}</Text>
              <Text style={[styles.body, styles.num]}>{w.new_users}</Text>
              <Text style={[styles.body, styles.num]}>{w.new_conversations}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.caption}>Counts only. No third-party analytics is installed.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    width: '23%',
    flexGrow: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
    alignItems: 'center',
  },
  statNumber: type.h2,
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  wide: { flex: 2 },
  num: { flex: 1, textAlign: 'right' },
  body: type.body,
  meta: type.meta,
  caption: type.caption,
});
