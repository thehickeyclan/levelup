import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { WEB_ORIGIN } from '@/lib/config';
import { colors } from '@/lib/theme';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order</Text>
      <Text style={styles.meta}>{id}</Text>
      <Pressable
        style={styles.button}
        onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/market/orders/${id}`)}
      >
        <Text style={styles.buttonText}>Open order details</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '800' },
  meta: { color: colors.textSecondary },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
