import Constants from 'expo-constants';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://www.wrestlingguild.com').replace(
  /\/$/,
  ''
);
export const TENANT_SLUG = process.env.EXPO_PUBLIC_TENANT_SLUG ?? 'guild';

export const WEB_ORIGIN = API_URL;

export function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const id = extra?.eas?.projectId;
  if (!id || id.startsWith('REPLACE_')) return undefined;
  return id;
}
