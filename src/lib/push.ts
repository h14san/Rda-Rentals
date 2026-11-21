import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Push registration, behind one wrapper.
 *
 * Push needs three things the app cannot give itself: a development or store
 * build (Expo Go on Android has had no remote push since SDK 53), an EAS
 * project id, and FCM/APNs credentials on that project. Until all three exist
 * every function here returns quietly and the in-app notifications list
 * carries on alone. Nothing in this file may throw into a screen.
 */

/** Must match ANDROID_CHANNEL in supabase/functions/send-push/index.ts. */
const ANDROID_CHANNEL = 'default';

export type PushState =
  /** Registered: this device will receive push. */
  | 'on'
  /** The user has not been asked yet, or dismissed the prompt. */
  | 'not-asked'
  /** The user said no; only the system settings can change that now. */
  | 'denied'
  /** Expo Go, a simulator, web, or a build with no EAS project id. */
  | 'unavailable';

// Remembered so sign-out can unregister this device without asking Expo again.
let registeredToken: string | null = null;

function projectId(): string | null {
  return (
    (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
    Constants.easConfig?.projectId ??
    null
  );
}

function supported(): boolean {
  return (
    Platform.OS !== 'web' &&
    Device.isDevice &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
    projectId() !== null
  );
}

// A notification that arrives while the app is open still shows: the user may
// be on the feed while a landlord replies.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Registers this device for push and stores its token.
 *
 * `prompt: false` registers only if permission was already given. That is what
 * runs at launch, so nobody is asked for a permission before they have seen
 * why. `prompt: true` is for a moment that explains itself: starting a
 * conversation, or the switch on the notification settings screen.
 */
export async function registerForPush({ prompt }: { prompt: boolean }): Promise<PushState> {
  if (!supported()) return 'unavailable';

  try {
    // Android 13+ only shows the permission prompt once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: 'Rwanda Rentals',
        // The enum is exported (build/index.js re-exports it), but SDK 58
        // compiles it to a form eslint-plugin-import cannot read.
        // eslint-disable-next-line import/namespace
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      if (!prompt || !permission.canAskAgain) {
        return permission.canAskAgain ? 'not-asked' : 'denied';
      }
      permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return permission.canAskAgain ? 'not-asked' : 'denied';
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: projectId()!,
    });

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) throw error;

    registeredToken = token;
    return 'on';
  } catch (e) {
    // Missing FCM credentials land here ("Default FirebaseApp is not
    // initialized"). That is a setup gap, not something to show a user.
    console.warn('Push registration failed:', e instanceof Error ? e.message : e);
    return 'unavailable';
  }
}

/**
 * Stops this device receiving the signed-in account's notifications. Called
 * before sign-out, while there is still a session to authorise it.
 */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  try {
    await supabase.rpc('unregister_push_token', { p_token: token });
  } catch {
    // Signing out must not fail over this. register_push_token moves the row
    // to whoever signs in next on this phone anyway.
  }
}

/** The app route a notification opens, from the ids in its payload. */
export function routeForNotification(
  kind: string,
  payload: Record<string, unknown>,
): string | null {
  const id = (key: string) => (typeof payload[key] === 'string' ? (payload[key] as string) : null);

  if (kind === 'message_new' || kind.startsWith('booking_')) {
    const conversation = id('conversation_id');
    if (conversation) return `/conversation/${conversation}`;
  }
  if (kind.startsWith('booking_')) return '/bookings';
  if (kind === 'verification_decided') return '/verify-identity';
  if (kind === 'report_resolved') return '/my-reports';
  if (kind === 'account_suspended' || kind === 'account_restored') return '/profile';

  const listing = id('listing_id');
  if (listing) {
    // A suspended or unpublished listing of your own is on your profile; the
    // public page may refuse to load it.
    return kind === 'listing_suspended' ? '/profile' : `/listing/${listing}`;
  }
  return null;
}
