import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useNotificationRealtime } from '@/lib/use-notification-realtime';
import { getNotificationDeepLink } from '@/lib/push';
import { colors } from '@/lib/theme';

export default function NotificationsScreen() {
  const { notifications, loading, markAllRead, refresh } = useNotificationRealtime();
  const router = useRouter();

  if (loading && notifications.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      onRefresh={() => void refresh()}
      refreshing={loading}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.heading}>Alerts</Text>
          <Pressable onPress={() => void markAllRead()}>
            <Text style={styles.mark}>Mark all read</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={[styles.row, !item.read_at && styles.unread]}
          onPress={() => {
            const href = getNotificationDeepLink(item.data ?? undefined);
            if (href) router.push(href as never);
          }}
        >
          <Text style={styles.title}>{item.title}</Text>
          {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
          <Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.meta}>No alerts yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heading: { fontSize: 22, fontWeight: '800' },
  mark: { color: colors.accent, fontWeight: '700' },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unread: { backgroundColor: colors.surface, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  title: { fontWeight: '700', fontSize: 15 },
  body: { marginTop: 4, color: colors.text, fontSize: 14, lineHeight: 20 },
  meta: { marginTop: 6, color: colors.textSecondary, fontSize: 12 },
});
