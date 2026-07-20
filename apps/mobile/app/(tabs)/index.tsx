import { Redirect } from 'expo-router';
import { CoachHomeScreen } from '@/components/coach-home';
import { useAuth } from '@/lib/auth';

/** Coach home. Parent mode always enters the combined Training experience. */
export default function HomeScreen() {
  const { isCoachView } = useAuth();

  if (!isCoachView) return <Redirect href="/(tabs)/find" />;
  return <CoachHomeScreen />;
}
