import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/context';
import { useInboxRealtime, useUnreadCount } from '@/features/messaging/queries';
import {
  useNotificationsRealtime,
  useUnreadNotificationCount,
} from '@/features/notifications/queries';
import { usePush } from '@/features/notifications/use-push';
import { colors, spacing } from '@/theme';

export default function TabsLayout() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // Mounted here, above every tab, so the badge is live wherever the user is.
  useInboxRealtime(userId);
  const unread = useUnreadCount(userId);
  const router = useRouter();
  useNotificationsRealtime(userId);
  usePush(userId);
  const unreadNotifications = useUnreadNotificationCount(userId);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.softBlack,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
        },
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { color: colors.softBlack },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.white },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Ask',
          headerTitle: 'Ask about rentals',
          // Off the tab bar: it did the same job as the search bar on Explore.
          // Asking now lives on each listing ("Ask about this place"), which
          // is a question the search bar cannot answer. The screen is kept, so
          // bringing the tab back is deleting this line.
          href: null,
          // Same sparkles mark as the feed's smart search bar and the
          // "Write it for me" action: one icon means "a model did this".
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          headerTitle: 'Saved rentals',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: 'Post',
          headerTitle: 'Post a rental',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.softBlack, color: colors.white },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'Your profile',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                unreadNotifications > 0
                  ? `Notifications, ${unreadNotifications} unread`
                  : 'Notifications'
              }
              hitSlop={8}
              onPress={() => router.push('/notifications')}
              style={styles.bell}
            >
              <Ionicons name="notifications-outline" size={24} color={colors.softBlack} />
              {unreadNotifications > 0 && <View style={styles.bellDot} />}
            </Pressable>
          ),
          // The dot on the tab is what tells someone on another tab to look.
          tabBarBadge: unreadNotifications > 0 ? '' : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.softBlack,
            minWidth: 10,
            height: 10,
            borderRadius: 5,
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bell: { marginRight: spacing.md },
  bellDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.softBlack,
    borderWidth: 2,
    borderColor: colors.white,
  },
});
