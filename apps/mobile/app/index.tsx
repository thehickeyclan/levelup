import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.black,
        }}
      >
        <GuildLogo size={180} variant="mark" />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)" />;
}
