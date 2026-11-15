import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/states';
import { AuthProvider, useAuth } from '@/features/auth/context';
import { FiltersProvider } from '@/features/listings/filters-context';
import { setActiveLanguage, useLanguage, useT } from '@/lib/i18n';
import { colors, fontAssets, type } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Kigali listings do not change second to second, and refetching on every
      // screen focus is expensive on metered mobile data.
      staleTime: 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Routes the user to the right place for their auth state.
 *
 * Three states matter: signed out, signed in but with no name yet (a
 * conversation with a nameless stranger is not one anyone answers), and ready.
 */
function AuthGate() {
  const { session, profile, mode, initializing } = useAuth();
  // Held behind the splash screen: rendering in the fallback face and then
  // swapping to Inter reflows every screen, which looks like a bug.
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // Typed as a tuple by typedRoutes; widen it to index freely.
  const segments = useSegments() as string[];
  const router = useRouter();
  const splashHidden = useRef(false);
  const t = useT();
  // Alerts are raised outside render and read the language from here.
  const language = useLanguage();
  useEffect(() => {
    setActiveLanguage(language);
  }, [language]);

  // A signed-in user whose profile row has not arrived yet is in neither state,
  // so hold rather than bounce them through the wrong screen.
  const profileLoading = !!session && !profile;
  // A font failure must not brick the app — fall through to the system face.
  const ready = !initializing && !profileLoading && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (!ready) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onProfileSetup = segments[1] === 'profile-setup';
    // No name yet, or the account has not said whether it is here to rent,
    // to host, or both. Accounts from before that question are asked once.
    const profileIncomplete = !!profile && (!profile.full_name || !mode);

    if (!session && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (session && profileIncomplete && !onProfileSetup) {
      router.replace('/profile-setup');
    } else if (session && !profileIncomplete && inAuthGroup) {
      router.replace('/');
    }
  }, [ready, session, profile, mode, segments, router]);

  useEffect(() => {
    if (ready && !splashHidden.current) {
      splashHidden.current = true;
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return <LoadingState label="Starting up…" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.white },
        headerTintColor: colors.softBlack,
        // A compact centred title and a bare back arrow: the content is the
        // screen, and the bar should take as little of it as it can.
        headerTitleStyle: { ...type.bodyStrong, fontSize: 17 },
        headerTitleAlign: 'center',
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.white },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="listing/[id]" options={{ title: '' }} />
      <Stack.Screen name="compare" options={{ title: t('Compare') }} />
      <Stack.Screen name="verify-identity" options={{ title: t('Verify your ID') }} />
      <Stack.Screen name="review/index" options={{ title: t('Review queue') }} />
      <Stack.Screen name="review/[caseId]" options={{ title: t('Review') }} />
      <Stack.Screen name="staff/index" options={{ title: t('Staff console') }} />
      <Stack.Screen name="staff/users/index" options={{ title: t('Users') }} />
      <Stack.Screen name="staff/users/[id]" options={{ title: t('Account') }} />
      <Stack.Screen name="staff/listings/index" options={{ title: t('Listings') }} />
      <Stack.Screen name="staff/listings/[id]" options={{ title: t('Listing') }} />
      <Stack.Screen name="staff/audit" options={{ title: t('Audit log') }} />
      <Stack.Screen name="staff/roles" options={{ title: t('Staff roles') }} />
      <Stack.Screen name="staff/reports/index" options={{ title: t('Reports') }} />
      <Stack.Screen name="staff/reports/[id]" options={{ title: t('Report') }} />
      <Stack.Screen
        name="staff/conversation/[reportId]"
        options={{ title: t('Reported conversation') }}
      />
      <Stack.Screen name="conversation/[id]" options={{ title: '' }} />
      <Stack.Screen name="edit-profile" options={{ title: t('Edit profile') }} />
      <Stack.Screen name="my-listings" options={{ title: t('Your listings') }} />
      <Stack.Screen name="bookings" options={{ title: t('Bookings') }} />
      <Stack.Screen name="saved-searches" options={{ title: t('Saved searches') }} />
      <Stack.Screen name="rate/[bookingId]" options={{ title: t('Write a review') }} />
      <Stack.Screen name="staff/unlock" options={{ title: t('Staff console') }} />
      <Stack.Screen name="book/[listingId]" options={{ title: t('Book') }} />
      <Stack.Screen name="staff/bookings" options={{ title: t('Bookings') }} />
      <Stack.Screen name="notifications" options={{ title: t('Notifications') }} />
      <Stack.Screen name="help/index" options={{ title: t('Safety and help') }} />
      <Stack.Screen name="help/[topic]" options={{ title: '' }} />
      <Stack.Screen
        name="notification-settings"
        options={{ title: t('Notification settings') }}
      />
      <Stack.Screen name="user/[id]" options={{ title: '' }} />
      <Stack.Screen name="my-reports" options={{ title: t('Your reports') }} />
      <Stack.Screen name="report" options={{ presentation: 'modal', title: t('Report') }} />
      <Stack.Screen
        name="filters"
        options={{ presentation: 'modal', title: t('Filters') }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FiltersProvider>
            <StatusBar style="dark" />
            <AuthGate />
          </FiltersProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
