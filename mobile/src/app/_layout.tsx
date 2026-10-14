import '../background/locationTask';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SplashOverlay } from '../components/SplashOverlay';
import { colors } from '../theme';

// Keep the native splash up until the JS overlay is mounted underneath it,
// then dissolve into the animated launch sequence.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 600, fade: true });

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);

  // Runs after the first commit — the JS splash overlay is already mounted
  // underneath, so dissolving the native splash reveals the animation.
  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
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
      {!splashDone && <SplashOverlay onDone={() => setSplashDone(true)} />}
    </SafeAreaProvider>
  );
}
