import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/context';
import { lists, rents } from '@/features/auth/mode';
import { useMyBookings } from '@/features/bookings/queries';
import { useInboxRealtime, useUnreadCount } from '@/features/messaging/queries';
import {
  useNotificationsRealtime,
  useUnreadNotificationCount,
} from '@/features/notifications/queries';
import { usePush } from '@/features/notifications/use-push';
import { useT } from '@/lib/i18n';
import { colors, fontFamily, spacing, type } from '@/theme';

export default function TabsLayout() {
  const { session, mode } = useAuth();
  const t = useT();
  const userId = session?.user.id ?? null;
  // Which tabs show follows what the account said it is here for. Hidden tabs
  // are still routes: a guest can reach /post from their profile. At most five
  // show at once, which is the limit on a small phone.
  //   guest: Explore, Saved, Messages, Profile
  //   host:  Listings, Post, Messages, Profile (opens on Listings)
  //   both:  Explore, Saved, Post, Messages, Profile (listings via the profile)
  const hidden = (show: boolean) => (show ? {} : { href: null });
  // Mounted here, above every tab, so the badge is live wherever the user is.
  useInboxRealtime(userId);
  const unread = useUnreadCount(userId);
  const router = useRouter();
  useNotificationsRealtime(userId);
  usePush(userId);
  const unreadNotifications = useUnreadNotificationCount(userId);
  // Bookings live under Profile, two taps from anywhere. A request waiting
  // for an answer expires in 72 hours, so the way to it also sits on the
  // Messages header, where the person asking already is.
  const bookings = useMyBookings(userId);
  const bookingsWaiting =
    bookings.data?.filter(
      (b) =>
        (b.landlord_id === userId && b.status === 'requested') ||
        (b.renter_id === userId && b.status === 'accepted'),
    ).length ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.softBlack,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 0.1 },
        tabBarItemStyle: { paddingTop: 4 },
        headerStyle: { backgroundColor: colors.white },
        headerTitleStyle: { ...type.h1, fontSize: 24 },
        // Tab screens are destinations, not steps: a large left-aligned title,
        // where pushed screens get a small centred one.
        headerTitleAlign: 'left',
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.white },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          ...hidden(mode !== 'host'),
          title: t('Explore'),
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          ...hidden(rents(mode)),
          title: t('Saved'),
          headerTitle: t('Saved rentals'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'heart' : 'heart-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="listings"
        options={{
          ...hidden(mode === 'host'),
          title: t('Listings'),
          headerTitle: t('Your listings'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          ...hidden(lists(mode)),
          title: t('Post'),
          headerTitle: t('Post a rental'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('Messages'),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                bookingsWaiting > 0 ? `Bookings, ${bookingsWaiting} waiting` : 'Bookings'
              }
              hitSlop={8}
              onPress={() => router.push('/bookings')}
              style={styles.headerButton}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.softBlack} />
              {bookingsWaiting > 0 && <View style={styles.bellDot} />}
            </Pressable>
          ),
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.softBlack, color: colors.white },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profile'),
          headerTitle: t('Your profile'),
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
              style={styles.headerButton}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.softBlack} />
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
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Header actions are round filled tiles, the same family as the menu icons.
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGray,
    marginRight: spacing.md,
  },
  bellDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.softBlack,
    borderWidth: 2,
    borderColor: colors.white,
  },
});
