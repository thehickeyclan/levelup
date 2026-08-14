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

  // Signed-out users land on the Login tab: the branded sign-in / signup page
  // with the guest tab bar (Training / Market / Login) underneath.
  if (!session) return <Redirect href="/(tabs)/join" />;
  return <Redirect href="/(tabs)" />;
}
