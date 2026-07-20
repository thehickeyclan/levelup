import { CoachHomeScreen } from '@/components/coach-home';
import { ParentHomeScreen } from '@/components/parent-home';
import { useAuth } from '@/lib/auth';

/** Role-aware Home: parent discovery and booking; coach operations and growth. */
export default function HomeScreen() {
  const { isCoachView } = useAuth();

  return isCoachView ? <CoachHomeScreen /> : <ParentHomeScreen />;
}
