import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useAuth } from '@/features/auth/context';
import { useDeleteSavedSearch, useSavedSearches } from '@/features/listings/extras';
import { useFilters } from '@/features/listings/filters-context';
import { filterSummary } from '@/features/listings/types';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Searches you asked to be told about. Tapping one runs it on Explore; a new
 * listing that matches one raises a notification.
 */
export default function SavedSearchesScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;
  const searches = useSavedSearches(userId);
  const remove = useDeleteSavedSearch(userId ?? '');
  const { setFilters, setInterpretation } = useFilters();

  if (!userId) return null;
  if (searches.isPending) return <LoadingState label="Loading your searches…" />;
  if (searches.isError)
    return <ErrorState error={searches.error} onRetry={() => void searches.refetch()} />;

  return (
    <FlatList
      data={searches.data}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={searches.isRefetching}
          onRefresh={() => void searches.refetch()}
        />
      }
      ListHeaderComponent={
        searches.data.length > 0 ? (
          <Text style={styles.meta}>
            We notify you when a new rental matches one of these.
          </Text>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          title="No saved searches"
          message="Set some filters on Explore, then tap Save this search. We will tell you when a new rental matches."
          actionLabel="Browse rentals"
          onAction={() => router.push('/')}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Run the search ${item.name}`}
          onPress={() => {
            setFilters(item.filters);
            setInterpretation(null);
            router.push('/');
          }}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="notifications-outline" size={20} color={colors.softBlack} />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {filterSummary(item.filters).join(' · ')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete the search ${item.name}`}
            hitSlop={10}
            onPress={() =>
              Alert.alert('Delete this search?', 'You will stop getting alerts for it.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(item.id) },
              ])
            }
          >
            <Ionicons name="trash-outline" size={20} color={colors.muted} />
          </Pressable>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  text: { flex: 1, gap: 2 },
  title: type.bodyStrong,
  meta: type.meta,
});
