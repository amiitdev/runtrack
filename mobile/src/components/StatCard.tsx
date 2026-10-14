import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}

/** Big number + caption. The building block of the dashboard grid. */
export function StatCard({ label, value, unit, accent }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Text
          style={[styles.value, accent && { color: colors.primary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
  },
  label: {
    ...type.label,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' },
  value: {
    ...type.stat,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 12,
    color: colors.textDim,
    marginLeft: 4,
    marginBottom: 4,
  },
});
