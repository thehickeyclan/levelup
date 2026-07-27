import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { fetchActiveCoaches, type MobileCoach } from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';

export default function SelectCoachScreen() {
  const router = useRouter();
  const { role, selectedCoachId, selectCoach, clearCoachSelection } = useAuth();
  const [coaches, setCoaches] = useState<MobileCoach[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCoaches(
        (await fetchActiveCoaches()).filter(
          (coach) => coach.first_name?.trim() || coach.last_name?.trim()
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load coaches');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return coaches;
    return coaches.filter((coach) =>
      `${coach.first_name} ${coach.last_name} ${coach.school ?? ''}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [coaches, query]);

  if (role !== 'admin') return <Redirect href="/(tabs)" />;

  async function choose(coach: MobileCoach) {
    const name = `${coach.first_name} ${coach.last_name}`.trim();
    await selectCoach(coach.id, name);
    router.replace('/(tabs)');
  }

  return (
    <FlatList
      style={styles.screen}
      data={visible}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.kicker}>ADMIN TESTING</Text>
          <Text style={styles.heading}>Preview a coach</Text>
          <Text style={styles.intro}>
            Choose whose schedule, availability, earnings, and coach tools you want to test.
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search coaches or schools"
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            style={styles.search}
          />
          {selectedCoachId ? (
            <Pressable
              style={styles.clear}
              onPress={() => void clearCoachSelection()}
              accessibilityRole="button"
            >
              <Text style={styles.clearText}>Clear selected coach</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading && coaches.length === 0 ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const name = `${item.first_name} ${item.last_name}`.trim();
        const selected = item.id === selectedCoachId;
        return (
          <Pressable
            style={[styles.row, selected && styles.rowSelected]}
            onPress={() => void choose(item)}
            accessibilityRole="button"
            accessibilityLabel={`Preview as ${name}`}
          >
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.avatar} resizeMode="contain" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarLetter}>{item.first_name?.[0] ?? '?'}</Text>
              </View>
            )}
            <View style={styles.rowBody}>
              <Text style={styles.name}>{name}</Text>
              {item.school ? <Text style={styles.school}>{item.school}</Text> : null}
            </View>
            <Text style={[styles.choose, selected && styles.chooseSelected]}>
              {selected ? 'Selected' : 'Choose'}
            </Text>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        !loading ? <Text style={styles.empty}>No coaches match that search.</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, paddingBottom: 48 },
  header: { marginBottom: 14 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 29 },
  intro: { ...typography.body, color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  search: {
    ...typography.body,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    marginTop: 18,
  },
  clear: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  clearText: { ...typography.bodySemi, color: colors.danger, fontSize: 12 },
  error: { ...typography.body, color: colors.danger, marginTop: 10 },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 11,
  },
  rowSelected: { backgroundColor: 'rgba(184,157,96,0.18)', marginHorizontal: -8, paddingHorizontal: 8 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.black,
  },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { ...typography.bodyBold, color: colors.accent, fontSize: 18 },
  rowBody: { flex: 1 },
  name: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  school: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  choose: { ...typography.bodyBold, color: colors.accent, fontSize: 12 },
  chooseSelected: { color: colors.success },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingTop: 40 },
});
