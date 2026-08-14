import { Redirect } from 'expo-router';
import { CoachHomeScreen } from '@/components/coach-home';
import { ParentHomeScreen } from '@/components/parent-home';
import { useAuth } from '@/lib/auth';

/** Role-aware Home: parent discovery and booking; coach operations and growth. */
export default function HomeScreen() {
  const { isCoachView, session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/(tabs)/market" />;

  return isCoachView ? <CoachHomeScreen /> : <ParentHomeScreen />;
}
