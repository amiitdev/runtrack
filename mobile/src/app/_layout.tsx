import '../background/locationTask';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MigrationPrompt } from '../components/MigrationPrompt';
import { SignInScreen } from '../components/SignInScreen';
import { SplashOverlay } from '../components/SplashOverlay';
import { registerTokenGetter } from '../lib/apiAuth';
import { clerkPublishableKey, tokenCache } from '../lib/clerk';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 600, fade: true });

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={clerkPublishableKey!} tokenCache={tokenCache}>
        <StatusBar style="light" />
        <AuthGate />
      </ClerkProvider>
      {!splashDone && <SplashOverlay onDone={() => setSplashDone(true)} />}
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  // Register Clerk's token getter so the API client can attach Bearer tokens.
  useEffect(() => {
    registerTokenGetter(() => getToken());
  }, [getToken]);

  if (!isLoaded) return null;

  if (!isSignedIn) return <SignInScreen />;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="run/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="records" options={{ animation: 'slide_from_right' }} />
      </Stack>
      <MigrationPrompt />
    </>
  );
}
