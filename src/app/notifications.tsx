import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, type Href } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useAuth } from '@/features/auth/context';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/features/notifications/queries';
import type { NotificationRow } from '@/features/notifications/types';
import { timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { routeForNotification } from '@/lib/push';
import { colors, fontFamily, radius, spacing, type } from '@/theme';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  messages: 'chatbubble-outline',
  listings: 'home-outline',
  saved: 'heart-outline',
  bookings: 'calendar-outline',
  account: 'shield-outline',
};

/** Everything the app has told this user, newest first. Works with push off. */
export default function NotificationsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;
  const list = useNotifications(userId);
  const markRead = useMarkNotificationsRead(userId ?? '');
  const t = useT();

  if (!userId) return null;

  const settingsButton = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
            hitSlop={8}
            onPress={() => router.push('/notification-settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.softBlack} />
          </Pressable>
        ),
      }}
    />
  );

  if (list.isPending)
    return (
      <>
        {settingsButton}
        <LoadingState label="Loading notifications…" />
      </>
    );
  if (list.isError)
    return (
      <>
        {settingsButton}
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      </>
    );

  const anyUnread = list.data.some((n) => !n.read_at);

  function open(n: NotificationRow) {
    if (!n.read_at) markRead.mutate(n.id);
    const route = routeForNotification(n.kind, n.payload);
    if (route) router.push(route as Href);
  }

  return (
    <>
      {settingsButton}
      <FlatList
        data={list.data}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
        ListHeaderComponent={
          anyUnread ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => markRead.mutate('all')}
              style={styles.markAll}
            >
              <Text style={styles.markAllText}>{t('Mark all as read')}</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="Nothing yet"
            message="Replies, decisions on your listings and changes to rentals you saved will appear here."
          />
        }
        ItemSeparatorComponent={() => <View style={styles.rule} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}${item.read_at ? '' : ', unread'}`}
            onPress={() => open(item)}
            style={({ pressed }) => [
              styles.row,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={[styles.iconTile, !item.read_at && styles.iconTileUnread]}>
              <Ionicons
                name={ICONS[item.category] ?? 'notifications-outline'}
                size={19}
                color={item.read_at ? colors.charcoal : colors.white}
              />
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, !item.read_at && styles.titleUnread]}>
                {t(item.title)}
              </Text>
              {!!item.body && (
                <Text style={styles.body} numberOfLines={3}>
                  {item.body}
                </Text>
              )}
              <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
  markAll: {
    alignSelf: 'flex-end',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
  },
  markAllText: type.label,
  // Boxless rows; unread is a dark icon tile and a bold title, not a grey slab.
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGray,
  },
  iconTileUnread: { backgroundColor: colors.softBlack },
  text: { flex: 1, gap: 2 },
  title: type.body,
  titleUnread: { fontFamily: fontFamily.semibold, color: colors.softBlack },
  body: type.meta,
  time: type.caption,
});
