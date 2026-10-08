import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RouteMap } from '../../components/RouteMap';
import { useRunTracker } from '../../hooks/useRunTracker';
import { colors, radius, spacing, type } from '../../theme';
import {
  formatKm,
  formatPace,
  formatSpeed,
  formatStopwatch,
} from '../../lib/format';

export default function LiveRun() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    status,
    snapshot,
    error,
    savedRun,
    canRetry,
    fixCount,
    start,
    pause,
    resume,
    stop,
    retrySave,
    discardRun,
    reset,
  } = useRunTracker();

  // Tapping STOP twice would save twice — arm the button first.
  const [confirmStop, setConfirmStop] = useState(false);

  const mapPoints = snapshot.points.map((p) => ({
    latitude: p.lat,
    longitude: p.lon,
  }));

  const done = (fn: () => void) => {
    setConfirmStop(false);
    fn();
  };

  /* ---------------- IDLE ---------------- */
  if (status === 'idle' || status === 'requesting') {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.scrollBody, { paddingTop: insets.top + spacing.md }]}
      >
        <Text style={styles.kicker}>Ready when you are</Text>
        <Text style={styles.heading}>Live Run</Text>

        <View style={styles.idleBody}>
          <View style={styles.hintRow}>
            <Ionicons name="navigate-outline" size={18} color={colors.primary} />
            <Text style={styles.hintText}>
              GPS locks when you press start. Distance, pace and your route are
              calculated on the phone in real time.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.startBtn,
              pressed && styles.pressed,
              status === 'requesting' && { opacity: 0.6 },
            ]}
            onPress={start}
            disabled={status === 'requesting'}
          >
            <Ionicons name="play" size={32} color="#0B1120" />
            <Text style={styles.startText}>
              {status === 'requesting' ? 'Waiting for GPS…' : 'START'}
            </Text>
          </Pressable>

          <View style={styles.legend}>
            <Legend icon="stopwatch-outline" label="Timestamp-based stopwatch" />
            <Legend icon="git-branch-outline" label="Haversine distance" />
            <Legend icon="pause-outline" label="PAUSE starts a new segment" />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  /* ---------------- SAVED ---------------- */
  if (status === 'saved' && savedRun) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.scrollBody, { paddingTop: insets.top + spacing.md }]}
      >
        <Text style={styles.kicker}>Run complete 🎉</Text>
        <Text style={styles.heading}>{formatKm(savedRun.distanceMeters)} km</Text>

        <View style={styles.summaryGrid}>
          <Summary label="Time" value={formatStopwatch(savedRun.durationSeconds)} />
          <Summary label="Pace" value={`${formatPace(savedRun.avgPaceSecPerKm)} /km`} />
          <Summary label="Speed" value={`${formatSpeed(savedRun.avgSpeedKmh)} km/h`} />
          <Summary label="Calories" value={`${savedRun.calories} kcal`} />
          <Summary label="Elevation" value={`${savedRun.elevationGainMeters} m`} />
          <Summary label="Steps" value={savedRun.steps.toLocaleString()} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={() => router.push(`/run/${savedRun.id}`)}
        >
          <Ionicons name="map-outline" size={18} color="#0B1120" />
          <Text style={styles.primaryText}>View route & splits</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.ghost, pressed && styles.pressedSm]}
          onPress={() => done(reset)}
        >
          <Text style={styles.ghostText}>Done</Text>
        </Pressable>
      </ScrollView>
    );
  }

  /* ---------------- ERROR ---------------- */
  if (status === 'error') {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.scrollBody, { paddingTop: insets.top + spacing.md }]}
      >
        <Text style={[styles.kicker, { color: colors.danger }]}>
          {canRetry ? 'Save failed' : 'Something went wrong'}
        </Text>

        <View style={styles.errorBox}>
          <Ionicons
            name={canRetry ? 'cloud-offline-outline' : 'alert-circle-outline'}
            size={20}
            color={colors.danger}
          />
          <Text style={styles.error}>{error}</Text>
        </View>

        {canRetry ? (
          <>
            <View style={styles.summaryGrid}>
              <Summary label="Distance" value={formatKm(snapshot.distanceMeters)} />
              <Summary label="Time" value={formatStopwatch(snapshot.elapsedSeconds)} />
              <Summary label="GPS points" value={String(snapshot.points.length)} />
            </View>
            <Text style={styles.reassure}>
              Your run is still here — nothing was lost. Retry when the API is back.
            </Text>

            <Pressable
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              onPress={retrySave}
            >
              <Ionicons name="refresh" size={18} color="#0B1120" />
              <Text style={styles.primaryText}>Retry save</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.discardBtn, pressed && styles.pressed]}
              onPress={() => void discardRun()}
            >
              <Text style={styles.discardText}>Discard run</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => done(reset)}
          >
            <Text style={styles.primaryText}>Back to start</Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  /* ---------------- TRACKING ---------------- */
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.statusRow}>
        <View
          style={[
            styles.dot,
            { backgroundColor: status === 'paused' ? colors.warning : colors.accent },
          ]}
        />
        <Text style={styles.statusText}>
          {status === 'paused'
            ? 'PAUSED'
            : status === 'saving'
              ? 'SAVING…'
              : snapshot.isMoving
                ? 'RECORDING'
                : 'STILL — pace/speed at 0'}
        </Text>
        <Text style={styles.fixText}>{fixCount} fixes</Text>
      </View>

      <Text style={styles.timer} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
        {formatStopwatch(snapshot.elapsedSeconds)}
      </Text>
      <Text style={styles.distance} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.7}>
        {formatKm(snapshot.distanceMeters)}
      </Text>

      <View style={styles.metricRow}>
        <Metric
          label="PACE NOW"
          value={snapshot.isMoving ? formatPace(snapshot.currentPaceSecPerKm) : '--:--'}
          unit="/km"
          dim={!snapshot.isMoving}
        />
        <Metric
          label="SPEED NOW"
          value={snapshot.isMoving ? formatSpeed(snapshot.currentSpeedKmh) : '0.00'}
          unit="km/h"
          dim={!snapshot.isMoving}
        />
        <Metric
          label="CLIMB"
          value={String(snapshot.elevationGainMeters)}
          unit="m"
        />
      </View>

      <Text style={styles.avgLine}>
        average so far · {formatSpeed(snapshot.avgSpeedKmh)} km/h ·{' '}
        {formatPace(snapshot.avgPaceSecPerKm)} /km
      </Text>

      <View style={styles.mapBox}>
        <RouteMap points={mapPoints} follow fill />
      </View>

      <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [
            styles.control,
            status === 'paused' ? styles.resumeBtn : styles.pauseBtn,
            pressed && styles.pressed,
          ]}
          onPress={status === 'paused' ? resume : pause}
        >
          <Ionicons
            name={status === 'paused' ? 'play' : 'pause'}
            size={20}
            color="#0B1120"
          />
          <Text style={styles.controlText}>
            {status === 'paused' ? 'RESUME' : 'PAUSE'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.control,
            confirmStop ? styles.stopArmed : styles.stopBtn,
            pressed && styles.pressed,
          ]}
          onPress={() => {
            if (!confirmStop) {
              setConfirmStop(true);
              return;
            }
            setConfirmStop(false);
            void stop();
          }}
          disabled={status === 'saving'}
        >
          <Ionicons name="square" size={18} color="#fff" />
          <Text style={[styles.controlText, { color: '#fff' }]}>
            {status === 'saving' ? 'SAVING…' : confirmStop ? 'TAP AGAIN' : 'STOP'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.footHint} numberOfLines={2}>
        {status === 'saving'
          ? 'Uploading your route to Neon…'
          : status === 'paused'
            ? 'Paused — the gap will not count towards your distance.'
            : 'Points closer than 2 m and fixes worse than 30 m are ignored.'}
      </Text>
    </View>
  );
}

function Metric({
  label,
  value,
  unit,
  dim = false,
}: {
  label: string;
  value: string;
  unit: string;
  dim?: boolean;
}) {
  return (
    <View style={[styles.metric, dim && styles.metricDim]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[styles.metricValue, dim && { color: colors.textFaint }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.metricUnit}>{unit}</Text>
    </View>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

function Legend({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.legendRow}>
      <Ionicons name={icon} size={15} color={colors.textDim} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md },
  scrollBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 2 },

  kicker: {
    ...type.label,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heading: { ...type.title, color: colors.text, marginTop: 4, fontSize: 28 },

  idleBody: { gap: spacing.lg, marginTop: spacing.lg },
  hintRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  hintText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 19 },
  startBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 4,
  },
  startText: { fontSize: 24, fontWeight: '900', color: '#0B1120', letterSpacing: 2 },
  legend: { gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { color: colors.textFaint, fontSize: 13 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  fixText: { marginLeft: 'auto', color: colors.textFaint, fontSize: 12 },

  timer: {
    flexShrink: 0,
    fontSize: 48,
    fontWeight: '200',
    color: colors.text,
    textAlign: 'center',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  distance: {
    flexShrink: 0,
    fontSize: 40,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  metricRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexShrink: 0 },
  metric: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  metricUnit: { fontSize: 10, color: colors.textFaint },
  metricDim: { opacity: 0.7 },
  avgLine: {
    fontSize: 11,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },

  mapBox: { flex: 1, minHeight: 130, marginTop: spacing.sm },

  controls: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexShrink: 0 },
  control: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 15,
    borderRadius: radius.md,
  },
  pauseBtn: { backgroundColor: colors.primary },
  resumeBtn: { backgroundColor: colors.accent },
  stopBtn: { backgroundColor: colors.danger },
  stopArmed: { backgroundColor: '#B91C1C' },
  controlText: { fontWeight: '800', fontSize: 15, color: '#0B1120', letterSpacing: 1 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  pressedSm: { opacity: 0.6 },

  footHint: {
    flexShrink: 0,
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    lineHeight: 15,
  },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  summaryCell: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    marginTop: spacing.lg,
  },
  primaryText: { color: '#0B1120', fontWeight: '800', fontSize: 16 },
  discardBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  discardText: { color: colors.textDim, fontWeight: '600', fontSize: 15 },
  ghost: { alignItems: 'center', paddingVertical: 14, marginTop: spacing.xs },
  ghostText: { color: colors.textDim, fontWeight: '600', fontSize: 15 },

  errorBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#2A1215',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  error: { flex: 1, color: colors.danger, fontSize: 14, lineHeight: 21 },
  reassure: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
});
