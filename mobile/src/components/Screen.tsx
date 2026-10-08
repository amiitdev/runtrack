import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Rendered on the right of the header (e.g. a "Records" link). */
  action?: ReactNode;
  scroll?: boolean;
}

/**
 * Page chrome: safe-area aware header + optional scrolling body.
 *
 * Two details that make scrolling work:
 *   · the ScrollView itself gets flex:1   → it fills the screen
 *   · contentContainer uses flexGrow:1    → fills when short, but NEVER
 *     shrinks, so tall content still overflows and scrolls.
 *   (Using `flex: 1` here would set flexBasis:0, clamp the container to the
 *    viewport and silently disable scrolling.)
 */
export function Screen({ title, subtitle, children, action, scroll = true }: Props) {
  const insets = useSafeAreaInsets();

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );

  if (!scroll) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        {header}
        <View style={styles.fillBody}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollBody, { paddingBottom: spacing.xl * 2 }]}
        showsVerticalScrollIndicator={false}
      >
        {header}
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  title: { ...type.title, color: colors.text },
  subtitle: { fontSize: 13, color: colors.textDim, marginTop: 2 },
  /** Grows to fill a short page, but lets tall content overflow → scroll. */
  scrollBody: { paddingHorizontal: spacing.md, flexGrow: 1 },
  fillBody: { paddingHorizontal: spacing.md, flex: 1 },
});
