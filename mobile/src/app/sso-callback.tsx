import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export default function SSOCallback() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
