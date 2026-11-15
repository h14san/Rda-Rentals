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
  const { session, profile, initializing } = useAuth();
  // Held behind the splash screen: rendering in the fallback face and then
  // swapping to Inter reflows every screen, which looks like a bug.
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // Typed as a tuple by typedRoutes; widen it to index freely.
  const segments = useSegments() as string[];
  const router = useRouter();
  const splashHidden = useRef(false);

  // A signed-in user whose profile row has not arrived yet is in neither state,
  // so hold rather than bounce them through the wrong screen.
  const profileLoading = !!session && !profile;
  // A font failure must not brick the app — fall through to the system face.
  const ready = !initializing && !profileLoading && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (!ready) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onProfileSetup = segments[1] === 'profile-setup';
    const profileIncomplete = !!profile && !profile.full_name;

    if (!session && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (session && profileIncomplete && !onProfileSetup) {
      router.replace('/profile-setup');
    } else if (session && !profileIncomplete && inAuthGroup) {
      router.replace('/');
    }
  }, [ready, session, profile, segments, router]);

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
        headerTitleStyle: type.h2,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.white },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="listing/[id]" options={{ title: '' }} />
      <Stack.Screen name="compare" options={{ title: 'Compare' }} />
      <Stack.Screen name="verify-identity" options={{ title: 'Verify your ID' }} />
      <Stack.Screen name="review/index" options={{ title: 'Review queue' }} />
      <Stack.Screen name="review/[caseId]" options={{ title: 'Review' }} />
      <Stack.Screen name="staff/index" options={{ title: 'Staff console' }} />
      <Stack.Screen name="staff/users/index" options={{ title: 'Users' }} />
      <Stack.Screen name="staff/users/[id]" options={{ title: 'Account' }} />
      <Stack.Screen name="staff/listings/index" options={{ title: 'Listings' }} />
      <Stack.Screen name="staff/listings/[id]" options={{ title: 'Listing' }} />
      <Stack.Screen name="staff/audit" options={{ title: 'Audit log' }} />
      <Stack.Screen name="staff/roles" options={{ title: 'Staff roles' }} />
      <Stack.Screen name="staff/reports/index" options={{ title: 'Reports' }} />
      <Stack.Screen name="staff/reports/[id]" options={{ title: 'Report' }} />
      <Stack.Screen
        name="staff/conversation/[reportId]"
        options={{ title: 'Reported conversation' }}
      />
      <Stack.Screen name="conversation/[id]" options={{ title: '' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="help/index" options={{ title: 'Safety and help' }} />
      <Stack.Screen name="help/[topic]" options={{ title: '' }} />
      <Stack.Screen
        name="notification-settings"
        options={{ title: 'Notification settings' }}
      />
      <Stack.Screen name="user/[id]" options={{ title: '' }} />
      <Stack.Screen name="my-reports" options={{ title: 'Your reports' }} />
      <Stack.Screen name="report" options={{ presentation: 'modal', title: 'Report' }} />
      <Stack.Screen
        name="filters"
        options={{ presentation: 'modal', title: 'Filters' }}
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
