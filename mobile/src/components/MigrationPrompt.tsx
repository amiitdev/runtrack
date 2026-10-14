import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth, useUser } from '@clerk/expo';
import { api } from '../api/client';
import { colors, radius, spacing, type } from '../theme';

/**
 * Mounted inside the signed-in area. After the user's very first sign-in,
 * checks whether any pre-auth runs still exist in the DB and asks whether
 * to link them to this account. One-shot — after claiming, nothing to show.
 */
export function MigrationPrompt() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);
  const checked = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || checked.current) return;
    checked.current = true;
    (async () => {
      try {
        const status = await api.migrationStatus();
        if (status.unownedRuns > 0) {
          setCount(status.unownedRuns);
          setVisible(true);
        }
      } catch {
        // Non-critical — silently skip.
      }
    })();
  }, [isLoaded, isSignedIn]);

  function claim() {
    setVisible(false);
    api
      .claimMigration()
      .then((r) => {
        Alert.alert(
          'All caught up!',
          `Linked ${r.claimedRuns} run${r.claimedRuns === 1 ? '' : 's'} to your account.`,
        );
      })
      .catch(() => {
        Alert.alert('Error', 'Could not link runs. Try again from the account menu.');
      });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome, {user?.firstName ?? 'Runner'}!</Text>
          <Text style={styles.body}>
            We found {count} run{count === 1 ? '' : 's'} from before accounts existed. Link
            them to your account so your history stays with you?
          </Text>
          <Pressable style={styles.primaryBtn} onPress={claim}>
            <Text style={styles.primaryText}>Yes, link my runs</Text>
          </Pressable>
          <Pressable style={styles.skipBtn} onPress={() => setVisible(false)}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  title: { ...type.title, color: colors.text, marginBottom: spacing.sm },
  body: { fontSize: 15, color: colors.textDim, lineHeight: 22, marginBottom: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryText: { fontSize: 15, fontWeight: '700', color: colors.bg },
  skipBtn: { paddingVertical: 10, alignItems: 'center' },
  skipText: { fontSize: 14, color: colors.textFaint },
});
