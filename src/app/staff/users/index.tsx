import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { StaffOnly, StaffRow } from '@/components/staff';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useStaffUsers } from '@/features/staff/queries';
import { timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { spacing } from '@/theme';

/** Find an account by name. An empty box lists the newest accounts. */
export default function StaffUsersScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const users = useStaffUsers(search, isStaff);

  if (!isStaff) return <StaffOnly />;

  return (
    <FlatList
      data={users.data ?? []}
      keyExtractor={(u) => u.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.search}>
          <TextField
            label="Search by name"
            value={q}
            onChangeText={setQ}
            placeholder="A name, or part of one"
            autoCorrect={false}
          />
        </View>
      }
      ListEmptyComponent={
        users.isPending ? (
          <LoadingState label="Searching…" />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : (
          <EmptyState title="Nobody found" message="No account has a name like that." />
        )
      }
      renderItem={({ item }) => (
        <StaffRow
          title={item.full_name ?? 'No name yet'}
          meta={`Joined ${timeAgo(item.created_at)}`}
          onPress={() => router.push(`/staff/users/${item.id}`)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  search: { marginBottom: spacing.sm },
});
