import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { ListingCard } from '@/components/listing-card';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle } from '@/components/ui';
import { BadgePill } from '@/components/verification-badges';
import { useAuth } from '@/features/auth/context';
import { usePublicProfile } from '@/features/profile/queries';
import { PROFILE_BADGE_LABELS } from '@/features/verification/types';
import { colors, radius, spacing, type } from '@/theme';

/**
 * A landlord as other users see them: name, what was checked, live listings.
 * No contact details here, ever. Contact goes through the listing.
 */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const profile = usePublicProfile(id);

  if (profile.isPending) return <LoadingState label="Loading profile…" />;
  if (profile.isError)
    return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;

  const p = profile.data;
  const isSelf = session?.user.id === p.id;
  const identityChecked = p.profile_badges.some((b) => b.kind === 'identity_checked');
  const joined = new Date(p.created_at).getFullYear();

  return (
    <FlatList
      data={p.listings}
      keyExtractor={(l) => l.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <Stack.Screen options={{ title: '' }} />
          <View style={styles.card}>
            <Text style={styles.name}>{p.full_name ?? 'Rwanda Rentals user'}</Text>
            <Text style={styles.meta}>On Rwanda Rentals since {joined}</Text>
            {identityChecked ? (
              <BadgePill label={PROFILE_BADGE_LABELS.identity_checked.label} />
            ) : (
              <Text style={styles.meta}>Identity not checked yet.</Text>
            )}
          </View>
          <SectionTitle>Live listings</SectionTitle>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.meta}>This person has no live listings right now.</Text>
      }
      renderItem={({ item }) => (
        <ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} />
      )}
      ListFooterComponent={
        isSelf ? undefined : (
          <Button
            label="Report this account"
            variant="ghost"
            onPress={() =>
              router.push({ pathname: '/report', params: { type: 'user', id: p.id } })
            }
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  header: { gap: spacing.lg, marginBottom: spacing.sm },
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  name: type.h2,
  meta: type.meta,
});
