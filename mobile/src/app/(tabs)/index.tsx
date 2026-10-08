import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { StatCard } from '../../components/StatCard';
import { BarChart } from '../../components/BarChart';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { colors, radius, spacing, type } from '../../theme';
import { formatDuration, formatKm, formatPace, formatSpeed, metersToKm } from '../../lib/format';

export default function Dashboard() {
  const router = useRouter();
  const dashboard = useAsync(() => api.dashboard());
  const chart = useAsync(() => api.chart(7));

  // Re-fetch whenever the tab regains focus — that is when you come back
  // from a finished run and expect the numbers to have changed.
  useFocusEffect(
    useCallback(() => {
      dashboard.reload();
      chart.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const d = dashboard.data;
  const bars = (chart.data ?? []).map((b) => ({
    label: b.label,
    value: Math.round((b.distanceMeters / 1000) * 10) / 10,
  }));

  return (
    <Screen
      title="RunTrack"
      subtitle={new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }).format(new Date())}
      action={
        <Link href="/records" asChild>
          <Pressable style={styles.streakBtn} hitSlop={8}>
            <Ionicons name="flame" size={16} color={colors.warning} />
            <Text style={styles.streakText}>{d?.streakDays ?? 0}</Text>
          </Pressable>
        </Link>
      }
    >
      {dashboard.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{dashboard.error}</Text>
          <Pressable onPress={dashboard.reload}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ---------- TODAY ---------- */}
      <Text style={styles.section}>Today</Text>
      <View style={styles.grid}>
        <StatCard label="Distance" value={metersToKm(d?.today.distanceMeters ?? 0)} unit="km" accent />
        <StatCard
          label="Time"
          value={formatDuration(d?.today.durationSeconds ?? 0)}
        />
        <StatCard label="Pace" value={formatPace(d?.today.avgPaceSecPerKm ?? 0)} unit="/km" />
        <StatCard label="Speed" value={formatSpeed(d?.today.avgSpeedKmh ?? 0)} unit="km/h" />
        <StatCard label="Calories" value={String(d?.today.calories ?? 0)} unit="kcal" />
        <StatCard label="Runs" value={String(d?.today.runCount ?? 0)} />
      </View>

      {/* ---------- THIS WEEK / MONTH ---------- */}
      <Text style={styles.section}>Progress</Text>
      <View style={styles.grid}>
        <StatCard
          label="This week"
          value={metersToKm(d?.week.distanceMeters ?? 0, 1)}
          unit="km"
          accent
        />
        <StatCard
          label="This month"
          value={metersToKm(d?.month.distanceMeters ?? 0, 1)}
          unit="km"
        />
        <StatCard label="All time" value={metersToKm(d?.allTime.distanceMeters ?? 0, 1)} unit="km" />
        <StatCard label="Total runs" value={String(d?.totalRuns ?? 0)} />
        <StatCard label="Month pace" value={formatPace(d?.month.avgPaceSecPerKm ?? 0)} unit="/km" />
        <StatCard label="Month kcal" value={String(d?.month.calories ?? 0)} />
      </View>

      {/* ---------- WEEKLY CHART ---------- */}
      <View style={{ marginTop: spacing.md }}>
        <BarChart
          title="Weekly distance"
          data={bars}
          unit="km"
          highlightIndex={bars.length - 1}
        />
      </View>

      {/* ---------- STREAK ---------- */}
      <Link href="/records" asChild>
        <Pressable style={styles.streakCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.streakTitle}>🔥 {d?.streakDays ?? 0} day streak</Text>
            <Text style={styles.streakSub}>
              {d && d.today.runCount > 0
                ? 'Today is already in the books. Keep it going.'
                : 'No run logged today — go break the chain.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
        </Pressable>
      </Link>

      {/* ---------- QUICK START ---------- */}
      <Pressable style={styles.cta} onPress={() => router.push('/run')}>
        <Ionicons name="play" size={20} color="#0B1120" />
        <Text style={styles.ctaText}>Start a run</Text>
      </Pressable>

      <Text style={styles.footnote}>
        {d ? `${formatKm(d.allTime.distanceMeters, 1)} logged across ${d.totalRuns} runs` : ' '}
      </Text>
    </Screen>
  );
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
  streakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  streakText: { color: colors.warning, fontWeight: '700', fontSize: 15 },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  streakTitle: { ...type.body, color: colors.text, fontWeight: '700', fontSize: 17 },
  streakSub: { fontSize: 13, color: colors.textDim, marginTop: 4 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    marginTop: spacing.lg,
  },
  ctaText: { color: '#0B1120', fontWeight: '800', fontSize: 17 },
  footnote: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.md,
  },
  errorBox: {
    backgroundColor: '#3B1212',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  retry: { color: colors.text, fontWeight: '700', marginTop: 8 },
});
