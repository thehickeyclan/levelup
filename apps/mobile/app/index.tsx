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

  // Guests land straight in the browse experience (Training tab); sign-in is
  // reachable from the Join tab and any gated action — never a login wall.
  if (!session) return <Redirect href="/(tabs)/find" />;
  return <Redirect href="/(tabs)" />;
}
