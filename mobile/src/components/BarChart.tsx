import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export interface ChartBar {
  label: string;
  /** Height driver, already in the unit you want compared (km, min, …). */
  value: number;
  /** Optional value shown under the bar on the highlight. */
  caption?: string;
}

interface Props {
  title: string;
  data: ChartBar[];
  unit: string;
  /** Bar to highlight (usually today). */
  highlightIndex?: number;
  height?: number;
}

/**
 * Hand-rolled bar chart.
 *
 *   12 ┤            ┌──┐
 *    9 ┤   ┌──┐     │  │        ┌──┐
 *    6 ┤┌──┤  │  ┌──┤  │  ┌──┐  │  │
 *    3 ┤│  │  │  │  │  │  │  │  │  │
 *    0 ┴┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──
 *      Mon Tue Wed Thu Fri Sat Sun
 *
 * Views instead of an SVG charting library: no native dependency, and the
 * bar heights are one `flex` calculation you can read at a glance.
 */
export function BarChart({ title, data, unit, highlightIndex, height = 140 }: Props) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const highlighted = highlightIndex ?? -1;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>

      <View style={[styles.plot, { height }]}>
        {data.map((bar, i) => {
          const ratio = bar.value / max;
          const isHi = i === highlighted;
          const isZero = bar.value === 0;
          return (
            <View key={`${bar.label}-${i}`} style={styles.col}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      height: `${Math.max(isZero ? 0 : 3, ratio * 100)}%`,
                      backgroundColor: isHi ? colors.accent : colors.bar,
                      opacity: isZero ? 0.25 : 1,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.xLabel, isHi && styles.xLabelHi]} numberOfLines={1}>
                {bar.label}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.axisRow}>
        <Text style={styles.axis}>0 {unit}</Text>
        <Text style={styles.axis}>
          {max.toFixed(max < 10 ? 1 : 0)} {unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  title: {
    ...type.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  col: { flex: 1, alignItems: 'center', height: '100%' },
  track: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    backgroundColor: colors.barTrack,
    borderRadius: 6,
    overflow: 'hidden',
  },
  fill: { width: '100%', borderRadius: 6 },
  xLabel: { fontSize: 11, color: colors.textFaint, marginTop: 6 },
  xLabelHi: { color: colors.accent, fontWeight: '700' },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  axis: { fontSize: 11, color: colors.textFaint },
});
