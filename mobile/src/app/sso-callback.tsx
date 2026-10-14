import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/**
 * Landing point after the Google OAuth browser redirects back into the app
 * via the `runtrack://` scheme.
 *
 * This screen used to render an <ActivityIndicator> unconditionally — so if
 * the deep link ever arrived without an active session (Android killing the
 * process while you were in Chrome is enough) it spun **forever** with no
 * way out.
 *
 * Clerk restores the session on the deep link; once `isLoaded` we simply
 * bounce to `/`, where AuthGate either renders the app or the sign-in
 * screen. There is no third state, so there is nothing left to wait for.
 */
export default function SSOCallback() {
  const { isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
