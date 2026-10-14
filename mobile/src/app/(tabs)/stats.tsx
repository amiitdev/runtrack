import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { BarChart } from '../../components/BarChart';
import { StatCard } from '../../components/StatCard';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { colors, radius, spacing, type } from '../../theme';
import {
  formatDuration,
  formatKm,
  formatPace,
  metersToKm,
} from '../../lib/format';

export default function Stats() {
  const dashboard = useAsync(() => api.dashboard());
  const week = useAsync(() => api.chart(7));
  const month = useAsync(() => api.chart(30));

  useFocusEffect(
    useCallback(() => {
      dashboard.reload();
      week.reload();
      month.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const d = dashboard.data;

  const weekBars = (week.data ?? []).map((b) => ({
    label: b.label,
    value: Math.round((b.distanceMeters / 1000) * 10) / 10,
  }));

  const monthBars = bucketByWeek(month.data ?? []);

  return (
    <Screen
      title="Statistics"
      subtitle="Distance, pace and effort over time"
      action={
        <Link href="/records" asChild>
          <Pressable style={styles.link} hitSlop={8}>
            <Ionicons name="trophy-outline" size={16} color={colors.warning} />
            <Text style={styles.linkText}>Records</Text>
          </Pressable>
        </Link>
      }
    >
      <Text style={styles.section}>Totals</Text>
      <View style={styles.grid}>
        <StatCard label="Today" value={metersToKm(d?.today.distanceMeters ?? 0)} unit="km" accent />
        <StatCard label="This week" value={metersToKm(d?.week.distanceMeters ?? 0, 1)} unit="km" />
        <StatCard label="This month" value={metersToKm(d?.month.distanceMeters ?? 0, 1)} unit="km" />
        <StatCard label="All time" value={metersToKm(d?.allTime.distanceMeters ?? 0, 1)} unit="km" />
      </View>

      <Text style={styles.section}>Effort</Text>
      <View style={styles.grid}>
        <StatCard label="Runs" value={String(d?.totalRuns ?? 0)} />
        <StatCard label="Time this month" value={formatDuration(d?.month.durationSeconds ?? 0)} />
        <StatCard label="Month pace" value={formatPace(d?.month.avgPaceSecPerKm ?? 0)} unit="/km" />
        <StatCard label="Month calories" value={String(d?.month.calories ?? 0)} unit="kcal" />
        <StatCard label="All-time pace" value={formatPace(d?.allTime.avgPaceSecPerKm ?? 0)} unit="/km" />
        <StatCard label="All-time kcal" value={String(d?.allTime.calories ?? 0)} />
      </View>

      <View style={{ marginTop: spacing.md, gap: spacing.md }}>
        <BarChart
          title="Last 7 days"
          data={weekBars}
          unit="km"
          highlightIndex={weekBars.length - 1}
        />
        <BarChart title="Last 4 weeks" data={monthBars} unit="km" height={120} />
      </View>

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textDim} />
        <Text style={styles.noteText}>
          Aggregates are recomputed from completed runs only. Paused time is excluded
          from duration, distance and pace.
        </Text>
      </View>

      <Text style={styles.footnote}>{formatKm(d?.allTime.distanceMeters ?? 0, 1)} all-time</Text>
    </Screen>
  );
}

/** Collapse 30 daily buckets into 4 weekly buckets for a zoomed-out view. */
function bucketByWeek(
  rows: { label: string; distanceMeters: number }[],
): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  for (let i = 0; i < rows.length; i += 7) {
    const slice = rows.slice(i, i + 7);
    const km = slice.reduce((s, r) => s + r.distanceMeters, 0) / 1000;
    out.push({ label: `W${Math.floor(i / 7) + 1}`, value: Math.round(km * 10) / 10 });
  }
  return out;
}

const styles = StyleSheet.create({
  section: {
    ...type.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  linkText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  note: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  noteText: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 18 },
  footnote: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.md,
  },
});
