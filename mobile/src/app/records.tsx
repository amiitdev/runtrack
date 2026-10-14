import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { colors, radius, spacing, type } from '../theme';
import { formatDuration, formatKm, formatPace, metersToKm } from '../lib/format';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Achievement {
  icon: string;
  title: string;
  detail: string;
  earned: boolean;
}

export default function Records() {
  const router = useRouter();
  const records = useAsync(() => api.records());
  const dashboard = useAsync(() => api.dashboard());

  // Days elapsed in the current local week (Monday = 0).
  const daysIntoWeek = useMemo(() => {
    const dow = new Date().getDay(); // 0 = Sun
    return ((dow + 6) % 7) + 1;
  }, []);

  const weekChart = useAsync(() => api.chart(daysIntoWeek));

  useFocusEffect(
    useCallback(() => {
      records.reload();
      dashboard.reload();
      weekChart.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const r = records.data;
  const streak = dashboard.data?.streakDays ?? 0;

  const weekFlags = useMemo(() => {
    const byLabel = new Map(
      (weekChart.data ?? []).map((b) => [b.label, b.distanceMeters > 0]),
    );
    // Only Mon..today exist in the response; the rest are still ahead of us.
    return WEEKDAYS.map((label, i) => {
      if (i >= daysIntoWeek) return { label, ran: false, future: true };
      return { label, ran: byLabel.get(label) ?? false, future: false };
    });
  }, [weekChart.data, daysIntoWeek]);

  const totalKm = r ? r.totalDistanceMeters / 1000 : 0;

  const achievements: Achievement[] = [
    { icon: '🏅', title: 'First 5K', detail: 'Run 5 km in one go', earned: (r?.longestRunMeters ?? 0) >= 5000 },
    { icon: '🏅', title: 'First 10K', detail: 'Run 10 km in one go', earned: (r?.longestRunMeters ?? 0) >= 10_000 },
    { icon: '🏅', title: '100 KM TOTAL', detail: '100 km lifetime', earned: totalKm >= 100 },
    { icon: '🏅', title: '500 KM TOTAL', detail: '500 km lifetime', earned: totalKm >= 500 },
    { icon: '🏅', title: '1,000 KM TOTAL', detail: '1,000 km lifetime', earned: totalKm >= 1000 },
    { icon: '🔥', title: '7 DAY STREAK', detail: 'Run 7 days in a row', earned: streak >= 7 },
    { icon: '🔥', title: '30 DAY STREAK', detail: 'Run 30 days in a row', earned: streak >= 30 },
  ];

  const earnedCount = achievements.filter((a) => a.earned).length;

  return (
    <Screen title="Personal records" subtitle={`${earnedCount} of ${achievements.length} badges earned`}>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={18} color={colors.textDim} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      {records.error ? <Text style={styles.error}>{records.error}</Text> : null}

      {/* ---------- RECORDS ---------- */}
      <View style={styles.recordGrid}>
        <Record
          icon="map-outline"
          label="Longest run"
          value={r ? metersToKm(r.longestRunMeters) : '—'}
          unit="km"
        />
        <Record
          icon="flash-outline"
          label="Fastest 1 km"
          value={r?.fastestKmPaceSec ? formatPace(r.fastestKmPaceSec) : '—'}
          unit="/km"
        />
        <Record
          icon="time-outline"
          label="Longest duration"
          value={r ? formatDuration(r.longestDurationSeconds) : '—'}
        />
        <Record
          icon="calendar-outline"
          label="Best week"
          value={r ? String(r.bestWeekKm) : '—'}
          unit="km"
        />
        <Record
          icon="calendar-outline"
          label="Best month"
          value={r ? String(r.bestMonthKm) : '—'}
          unit="km"
        />
        <Record
          icon="footsteps-outline"
          label="Total runs"
          value={r ? String(r.totalRuns) : '—'}
        />
      </View>

      {/* ---------- STREAK ---------- */}
      <Text style={styles.section}>🔥 {streak} day streak</Text>
      <View style={styles.streakCard}>
        {weekFlags.map((day) => (
          <View key={day.label} style={styles.dayCol}>
            <Text style={styles.dayLabel}>{day.label}</Text>
            <View
              style={[
                styles.dot,
                day.future && styles.dotFuture,
                day.ran && styles.dotOn,
              ]}
            >
              <Ionicons
                name={day.ran ? 'checkmark' : 'ellipse-outline'}
                size={day.ran ? 16 : 10}
                color={day.ran ? '#0B1120' : colors.textFaint}
              />
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.streakHint}>
        A day counts when you log at least 1 km. Today still counts if you run before
        midnight.
      </Text>

      {/* ---------- ACHIEVEMENTS ---------- */}
      <Text style={styles.section}>Achievements</Text>
      <View style={styles.badgeGrid}>
        {achievements.map((a) => (
          <View key={a.title} style={[styles.badge, !a.earned && styles.badgeLocked]}>
            <Text style={styles.badgeIcon}>{a.earned ? a.icon : '🔒'}</Text>
            <Text style={[styles.badgeTitle, !a.earned && styles.badgeTitleLocked]}>
              {a.title}
            </Text>
            <Text style={styles.badgeDetail}>{a.detail}</Text>
          </View>
        ))}
      </View>

      {r ? (
        <Text style={styles.footnote}>
          {formatKm(r.totalDistanceMeters, 1)} · {r.totalRuns} runs · best week{' '}
          {r.bestWeekKm} km
        </Text>
      ) : null}
    </Screen>
  );
}

function Record({
  icon,
  label,
  value,
  unit,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={styles.record}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text
        style={styles.recordValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {value}
        {unit ? <Text style={styles.recordUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.recordLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingVertical: 6,
    marginBottom: spacing.xs,
  },
  backText: { color: colors.textDim, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  record: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  recordValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  recordUnit: { fontSize: 13, fontWeight: '600', color: colors.textDim },
  recordLabel: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  section: {
    ...type.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  streakCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  dayCol: { alignItems: 'center', gap: 8 },
  dayLabel: { fontSize: 11, color: colors.textFaint, fontWeight: '700' },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.barTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.accent },
  dotFuture: { opacity: 0.35 },
  streakHint: {
    fontSize: 12,
    color: colors.textFaint,
    marginTop: spacing.sm,
    lineHeight: 17,
  },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  badgeLocked: { opacity: 0.45 },
  badgeIcon: { fontSize: 24 },
  badgeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
    textAlign: 'center',
  },
  badgeTitleLocked: { color: colors.textDim },
  badgeDetail: { fontSize: 10, color: colors.textFaint, marginTop: 2, textAlign: 'center' },
  footnote: {
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.lg,
  },
});
