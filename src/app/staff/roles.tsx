import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text } from 'react-native';

import { StaffOnly, StaffRow } from '@/components/staff';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useStaffMembers } from '@/features/staff/queries';
import { spacing, type } from '@/theme';

/**
 * Who the staff are. Admin only: RLS shows anyone else just their own roles,
 * so for a verifier this would be a list of one.
 *
 * Roles are changed on the account's own page, where the person can be looked
 * at before being given access.
 */
export default function StaffRolesScreen() {
  const { roles } = useAuth();
  const router = useRouter();
  const isAdmin = roles.includes('admin');
  const members = useStaffMembers(isAdmin);

  if (!isAdmin) {
    return <EmptyState title="Admins only" message="Only an admin can see and change staff roles." />;
  }
  if (members.isPending) return <LoadingState label="Loading staff…" />;
  if (members.isError)
    return <ErrorState error={members.error} onRetry={() => void members.refetch()} />;

  return (
    <FlatList
      data={members.data}
      keyExtractor={(m) => m.user_id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={members.isRefetching} onRefresh={() => void members.refetch()} />
      }
      ListHeaderComponent={
        <Text style={styles.meta}>
          To add someone, find their account under Users and grant the role there.
        </Text>
      }
      ListEmptyComponent={<StaffOnly />}
      ListFooterComponent={
        <Button label="Find an account" variant="secondary" onPress={() => router.push('/staff/users')} />
      }
      renderItem={({ item }) => (
        <StaffRow
          caption={item.roles.map((r) => (r === 'admin' ? 'Admin' : 'Verifier')).join(' · ')}
          title={item.full_name ?? 'No name yet'}
          onPress={() => router.push(`/staff/users/${item.user_id}`)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  meta: { ...type.meta, marginBottom: spacing.sm },
});
