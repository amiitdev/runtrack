import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import type { Run } from '../../api/types';
import { colors, radius, spacing, type } from '../../theme';
import {
  formatDateTime,
  formatDuration,
  formatPace,
  metersToKm,
} from '../../lib/format';

export default function History() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const runs = useAsync(() => api.listRuns(100));
  const [clearing, setClearing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      runs.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const data = runs.data ?? [];
  const totalKm = data.reduce((sum, r) => sum + r.distanceMeters, 0) / 1000;

  const confirmClear = () => {
    if (data.length === 0 || clearing) return;
    Alert.alert(
      'Clear all history?',
      `This deletes ${data.length} runs, their routes and splits from Neon. Your profile (weight, stride) is kept. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await api.clearHistory();
              runs.reload();
            } catch (err) {
              Alert.alert('Could not clear history', String(err));
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.title}>History</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {data.length} runs · {totalKm.toFixed(1)} km
          </Text>
        </View>

        {data.length > 0 ? (
          <Pressable
            onPress={confirmClear}
            disabled={clearing}
            hitSlop={8}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
          >
            {clearing ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
            )}
            <Text style={styles.clearText}>{clearing ? 'Clearing…' : 'Clear'}</Text>
          </Pressable>
        ) : null}
      </View>

      {runs.error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{runs.error}</Text>
          <Pressable onPress={runs.reload}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : runs.loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Loading…</Text>
        </View>
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="footsteps-outline" size={40} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>No runs yet</Text>
          <Text style={styles.emptyText}>
            Finish your first run and it will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={data}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => <RunRow run={item} onPress={() => router.push(`/run/${item.id}`)} />}
        />
      )}
    </View>
  );
}

function RunRow({ run, onPress }: { run: Run; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.icon}>
        <Ionicons name="walk" size={20} color={colors.primary} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {metersToKm(run.distanceMeters)} km
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {formatDateTime(run.startedAt)}
        </Text>
      </View>

      <View style={styles.rowRight}>
        <Text style={styles.rowTime}>{formatDuration(run.durationSeconds)}</Text>
        <Text style={styles.rowPace}>{formatPace(run.avgPaceSecPerKm)} /km</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 78,
    justifyContent: 'center',
  },
  clearText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  rowSub: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowTime: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowPace: { color: colors.textDim, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  retry: { color: colors.primary, fontWeight: '700', marginTop: 8 },
});
