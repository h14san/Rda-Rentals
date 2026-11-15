import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Chip } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  isUnread,
  myState,
  otherParty,
  useInbox,
  type ConversationSummary,
} from '@/features/messaging/queries';
import { timeAgo } from '@/lib/format';
import { imageUrl } from '@/lib/supabase';
import { colors, fontFamily, radius, spacing, type } from '@/theme';

/** The inbox: one row per listing you are talking about, newest first. */
export default function MessagesScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;
  const inbox = useInbox(userId);
  const [showArchived, setShowArchived] = useState(false);

  // Tabs stay mounted for a render after sign-out. See ProfileScreen.
  if (!userId) return null;
  if (inbox.isPending) return <LoadingState label="Loading your messages…" />;
  if (inbox.isError)
    return <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />;

  const archivedCount = inbox.data.filter((c) => myState(c)?.archived).length;
  const items = inbox.data.filter((c) => !!myState(c)?.archived === showArchived);

  return (
    <FlatList
      data={items}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()} />
      }
      ListHeaderComponent={
        archivedCount > 0 || showArchived ? (
          <View style={styles.filters}>
            <Chip label="Inbox" selected={!showArchived} onPress={() => setShowArchived(false)} />
            <Chip
              label={`Archived (${archivedCount})`}
              selected={showArchived}
              onPress={() => setShowArchived(true)}
            />
          </View>
        ) : null
      }
      ListEmptyComponent={
        showArchived ? (
          <EmptyState title="Nothing archived" message="Archived conversations appear here." />
        ) : (
          <EmptyState
            title="No messages yet"
            message="Open a rental and tap Message landlord to ask about it. Your conversations appear here."
            actionLabel="Browse rentals"
            onAction={() => router.push('/')}
          />
        )
      }
      renderItem={({ item }) => (
        <Row
          conversation={item}
          userId={userId}
          onPress={() => router.push(`/conversation/${item.id}`)}
        />
      )}
    />
  );
}

function Row({
  conversation: c,
  userId,
  onPress,
}: {
  conversation: ConversationSummary;
  userId: string;
  onPress: () => void;
}) {
  const other = otherParty(c, userId);
  const unread = isUnread(c, userId);
  const cover = c.listings?.listing_images[0];
  const mine = c.last_message_sender_id === userId;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${other?.full_name ?? 'Conversation'} about ${c.listing_title}${
        unread ? ', unread' : ''
      }`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      {cover ? (
        <Image
          source={{ uri: imageUrl(cover.storage_path) }}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={styles.thumb} />
      )}

      <View style={styles.text}>
        <View style={styles.topLine}>
          <Text style={[styles.name, unread && styles.unreadText]} numberOfLines={1}>
            {other?.full_name ?? 'Rwanda Rentals user'}
          </Text>
          <Text style={styles.time}>{timeAgo(c.last_message_at)}</Text>
        </View>
        <Text style={styles.listing} numberOfLines={1}>
          {c.listing_title}
          {c.renter_id === userId ? '' : ' · your listing'}
        </Text>
        <Text style={[styles.preview, unread && styles.unreadText]} numberOfLines={1}>
          {c.last_message_preview === null
            ? 'No messages yet'
            : `${mine ? 'You: ' : ''}${c.last_message_preview}`}
        </Text>
      </View>

      {unread && <View style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.lightGray,
  },
  text: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { ...type.bodyStrong, flexShrink: 1 },
  time: type.caption,
  listing: type.caption,
  preview: type.meta,
  unreadText: { fontFamily: fontFamily.bold, color: colors.softBlack },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.softBlack },
});
