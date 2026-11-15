import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { registerForPush, routeForNotification } from '@/lib/push';

/**
 * Wires push into the signed-in app: registers the device if permission was
 * already given, and opens the right screen when a notification is tapped.
 *
 * Mounted once, in the tabs layout, so it only exists behind the auth gate.
 */
export function usePush(userId: string | null) {
  const router = useRouter();
  // The id of the last tap handled, so the cold-start response and the live
  // listener cannot both navigate for the same tap.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    // Never prompts here. See registerForPush.
    void registerForPush({ prompt: false });
  }, [userId]);

  // Covers both a tap while the app is running and the tap that launched it.
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (Platform.OS === 'web' || !userId || !lastResponse) return;

    const request = lastResponse.notification.request;
    if (handled.current === request.identifier) return;
    handled.current = request.identifier;

    const data = (request.content.data ?? {}) as Record<string, unknown>;
    const kind = typeof data.kind === 'string' ? data.kind : '';
    const route = routeForNotification(kind, data);
    if (route) router.push(route as Href);
  }, [lastResponse, userId, router]);
}
