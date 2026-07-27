import AsyncStorage from '@react-native-async-storage/async-storage';

const COACH_ID_KEY = 'guild.selectedCoachId';
const COACH_NAME_KEY = 'guild.selectedCoachName';

export async function getSelectedCoachId(): Promise<string | null> {
  return AsyncStorage.getItem(COACH_ID_KEY);
}

export async function getSelectedCoach(): Promise<{ id: string | null; name: string | null }> {
  const [id, name] = await Promise.all([
    AsyncStorage.getItem(COACH_ID_KEY),
    AsyncStorage.getItem(COACH_NAME_KEY),
  ]);
  return { id, name };
}

export async function saveSelectedCoach(id: string, name: string): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(COACH_ID_KEY, id),
    AsyncStorage.setItem(COACH_NAME_KEY, name),
  ]);
}

export async function clearSelectedCoach(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(COACH_ID_KEY),
    AsyncStorage.removeItem(COACH_NAME_KEY),
  ]);
}
