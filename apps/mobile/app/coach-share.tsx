import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { colors, typography } from '@/lib/theme';

export default function CoachShareScreen() {
  const { user, role, selectedCoachId, selectedCoachName } = useAuth();
  const coachId = role === 'admin' ? selectedCoachId : user?.id ?? null;
  const [coachName, setCoachName] = useState(selectedCoachName ?? 'My');
  const [loading, setLoading] = useState(true);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!coachId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void supabase
      .from('athletes')
      .select('first_name, last_name')
      .eq('id', coachId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const name = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();
        if (name) setCoachName(name);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [coachId]);

  const publicUrl = useMemo(
    () => (coachId ? `${API_URL}/coach/${coachId}` : ''),
    [coachId]
  );
  const qrUrl = useMemo(
    () => (coachId ? `${API_URL}/api/coaches/${coachId}/qr` : ''),
    [coachId]
  );

  async function shareCoachingPage() {
    if (!publicUrl) return;
    await Share.share({
      title: `${coachName} · The Wrestling Guild`,
      message: `Train with me through The Wrestling Guild. View my profile, availability, and every upcoming session: ${publicUrl}`,
      url: publicUrl,
    });
  }

  if (!coachId) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Choose a coach first</Text>
        <Text style={styles.emptyText}>
          Select the coach you want to preview, then return here to share their public page.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>GROW YOUR SESSIONS</Text>
      <Text style={styles.heading}>Share your coaching page</Text>
      <Text style={styles.intro}>
        One permanent link for your profile, availability, and every upcoming session. Share it with
        parents, prospects, teams, and wrestling rooms.
      </Text>

      <View style={styles.qrCard}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={styles.qr} />
        ) : qrFailed ? (
          <View style={[styles.qr, styles.qrFallback]}>
            <Text style={styles.qrFallbackText}>QR unavailable</Text>
          </View>
        ) : (
          <Image
            source={{ uri: qrUrl }}
            style={styles.qr}
            resizeMode="contain"
            onError={() => setQrFailed(true)}
          />
        )}
        <Text style={styles.coachName}>{coachName}</Text>
        <Text style={styles.qrHelp}>Scan to view profile and book training</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={() => void shareCoachingPage()}>
        <Text style={styles.primaryButtonText}>Share profile & all sessions</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => void Linking.openURL(publicUrl)}>
        <Text style={styles.secondaryButtonText}>Preview public page</Text>
      </Pressable>
      <Pressable
        style={styles.secondaryButton}
        onPress={() => void Linking.openURL(`${API_URL}/qr/coach/${coachId}`)}
      >
        <Text style={styles.secondaryButtonText}>Open printable QR</Text>
      </Pressable>

      <View style={styles.tip}>
        <Text style={styles.tipTitle}>Use the same link everywhere</Text>
        <Text style={styles.tipText}>
          Put this QR on flyers, your social profiles, team messages, and gym posters. New sessions
          automatically appear—there is nothing to resend.
        </Text>
      </View>
      <Text selectable style={styles.url}>{publicUrl}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  center: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 34, marginTop: 7 },
  intro: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  qrCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    padding: 20,
    marginTop: 22,
  },
  qr: { width: 248, height: 248, backgroundColor: '#ffffff', borderRadius: 4 },
  qrFallback: { alignItems: 'center', justifyContent: 'center' },
  qrFallbackText: { ...typography.bodySemi, color: colors.textMuted },
  coachName: { ...typography.display, color: colors.text, fontSize: 24, marginTop: 16 },
  qrHelp: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 5,
    marginTop: 18,
  },
  primaryButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 5,
    marginTop: 10,
  },
  secondaryButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  tip: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 14,
    marginTop: 24,
  },
  tipTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  tipText: { ...typography.body, color: colors.textSecondary, lineHeight: 20, marginTop: 4 },
  url: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 20 },
  emptyTitle: { ...typography.display, color: colors.text, fontSize: 28 },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
  },
});
