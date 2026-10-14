import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteMap } from '../../components/RouteMap';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { colors, radius, spacing, type } from '../../theme';
import {
  formatDateTime,
  formatDuration,
  formatKm,
  formatPace,
  formatSpeed,
} from '../../lib/format';

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const detail = useAsync(() => api.getRun(id), [id]);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      detail.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]),
  );

  const run = detail.data?.run;
  const points = (detail.data?.points ?? []).map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));
  const splits = detail.data?.splits ?? [];

  const confirmDelete = () => {
    Alert.alert('Delete this run?', 'The route and all splits will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteRun(id);
            router.back();
          } catch (err) {
            setDeleting(false);
            Alert.alert('Could not delete', String(err));
          }
        },
      },
    ]);
  };

  if (detail.loading && !run) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Loading run…</Text>
      </View>
    );
  }

  if (!run) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{detail.error ?? 'Run not found'}</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const pace = formatPace(run.avgPaceSecPerKm);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.xl * 2,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.topTitle}>Run summary</Text>
          <Pressable onPress={confirmDelete} hitSlop={10} style={styles.iconBtn}>
            <Ionicons
              name="trash-outline"
              size={20}
              color={deleting ? colors.textFaint : colors.danger}
            />
          </Pressable>
        </View>

        <Text style={styles.date}>{formatDateTime(run.startedAt)}</Text>
        <Text style={styles.bigDistance}>{formatKm(run.distanceMeters)}</Text>
        <Text style={styles.pace}>
          {pace} /km · {formatDuration(run.durationSeconds)}
        </Text>

        <View style={styles.grid}>
          <Cell label="Avg speed" value={`${formatSpeed(run.avgSpeedKmh)} km/h`} />
          <Cell label="Max speed" value={`${formatSpeed(run.maxSpeedKmh)} km/h`} />
          <Cell label="Calories" value={`${run.calories} kcal`} />
          <Cell label="Elevation" value={`${run.elevationGainMeters} m`} />
          <Cell label="Steps" value={run.steps.toLocaleString()} />
          <Cell label="Moving time" value={formatDuration(run.durationSeconds)} />
        </View>

        <Text style={styles.section}>Route</Text>
        <RouteMap points={points} markers height={280} />

        {splits.length > 0 ? (
          <>
            <Text style={styles.section}>Splits</Text>
            <View style={styles.table}>
              <View style={[styles.tr, styles.trHead]}>
                <Text style={[styles.th, { flex: 1 }]}>KM</Text>
                <Text style={[styles.th, { flex: 1.4, textAlign: 'right' }]}>TIME</Text>
                <Text style={[styles.th, { flex: 1.4, textAlign: 'right' }]}>PACE</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>CLIMB</Text>
              </View>
              {splits.map((s) => {
                const fastest = splits.reduce((m, x) => Math.min(m, x.paceSecPerKm || 9999), 9999);
                const isFast = s.paceSecPerKm === fastest && s.paceSecPerKm > 0;
                return (
                  <View key={s.id} style={styles.tr}>
                    <Text style={[styles.td, { flex: 1, color: colors.textDim }]}>
                      {s.index}
                    </Text>
                    <Text style={[styles.td, { flex: 1.4, textAlign: 'right' }]}>
                      {formatDuration(s.durationSeconds)}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        { flex: 1.4, textAlign: 'right', color: isFast ? colors.accent : colors.text },
                      ]}
                    >
                      {formatPace(s.paceSecPerKm)}
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>
                      {s.elevationGainMeters} m
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteText}>Delete run</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: colors.textDim, fontSize: 15 },
  backLink: { paddingVertical: 8, paddingHorizontal: 14 },
  backLinkText: { color: colors.primary, fontWeight: '700' },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  date: { color: colors.textDim, fontSize: 14, marginTop: spacing.sm },
  bigDistance: {
    fontSize: 54,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.5,
  },
  pace: { color: colors.text, fontSize: 16, marginTop: -4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  cell: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cellLabel: {
    fontSize: 11,
    color: colors.textFaint,
    letterSpacing: 0.8,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cellValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  section: {
    ...type.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trHead: { backgroundColor: colors.surfaceAlt },
  th: { fontSize: 11, color: colors.textFaint, fontWeight: '800', letterSpacing: 0.8 },
  td: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: { color: colors.danger, fontWeight: '700' },
});
