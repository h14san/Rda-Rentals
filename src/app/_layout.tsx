import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/states';
import { AuthProvider, useAuth } from '@/features/auth/context';
import { FiltersProvider } from '@/features/listings/filters-context';
import { colors } from '@/theme';

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
 * Three states matter: signed out, signed in but with an incomplete profile
 * (no name or contact number — a listing would be uncontactable), and ready.
 */
function AuthGate() {
  const { session, profile, initializing } = useAuth();
  // Typed as a tuple by typedRoutes; widen it to index freely.
  const segments = useSegments() as string[];
  const router = useRouter();
  const splashHidden = useRef(false);

  // A signed-in user whose profile row has not arrived yet is in neither state,
  // so hold rather than bounce them through the wrong screen.
  const profileLoading = !!session && !profile;
  const ready = !initializing && !profileLoading;

  useEffect(() => {
    if (!ready) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onProfileSetup = segments[1] === 'profile-setup';
    const profileIncomplete = !!profile && (!profile.full_name || !profile.whatsapp_phone);

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
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.white },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="listing/[id]" options={{ title: '' }} />
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
