import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type Wrestler = {
  id: string;
  first_name: string;
  last_name: string;
  photo_url?: string | null;
  school?: string | null;
  age?: number | null;
  weight_class?: string | null;
  skill_level?: string | null;
  graduation_year?: number | null;
};

export default function MyWrestlersScreen() {
  const router = useRouter();
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setWrestlers((await apiFetch<{ youthWrestlers: Wrestler[] }>('/api/youth-wrestlers')).youthWrestlers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wrestlers');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>FAMILY</Text>
          <Text style={styles.heading}>My wrestlers</Text>
          <Text style={styles.sub}>Profiles, photos, and training details.</Text>
        </View>
        <Pressable style={styles.add} onPress={() => router.push('/wrestler-edit/new')}><Text style={styles.addText}>+ Add</Text></Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && wrestlers.length === 0 ? <ActivityIndicator color={colors.accent} /> : null}
      {wrestlers.map((wrestler) => (
        <Pressable key={wrestler.id} style={styles.card} onPress={() => router.push(`/wrestler-edit/${wrestler.id}`)}>
          {wrestler.photo_url ? <Image source={{ uri: wrestler.photo_url }} style={styles.avatar} /> : <View style={styles.avatar} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{wrestler.first_name} {wrestler.last_name}</Text>
            <Text style={styles.meta}>{[wrestler.school, wrestler.graduation_year ? `Class of ${wrestler.graduation_year}` : null].filter(Boolean).join(' · ')}</Text>
            <Text style={styles.detail}>{[wrestler.age ? `${wrestler.age}y` : null, wrestler.weight_class, wrestler.skill_level].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      ))}
      {!loading && wrestlers.length === 0 ? <Text style={styles.empty}>Add your first wrestler to begin booking training.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 32, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 5 },
  add: { backgroundColor: colors.accent, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  addText: { ...typography.bodyBold, color: colors.black },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.surface },
  name: { ...typography.bodyBold, color: colors.text, fontSize: 17 },
  meta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  detail: { ...typography.body, color: colors.accent, fontSize: 12, marginTop: 4, textTransform: 'capitalize' },
  arrow: { color: colors.accent, fontSize: 28 },
  error: { ...typography.body, color: colors.danger, marginVertical: 12 },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: 30 },
});
