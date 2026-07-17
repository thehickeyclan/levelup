import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { getTenantConfig } from '@/config/tenants';

/**
 * User-scoped Supabase client for Route Handlers / Server Components.
 * Supports cookie sessions (web) and `Authorization: Bearer <jwt>` (iOS / Expo).
 */
export async function createClient(tenantSlug: string) {
  const config = getTenantConfig(tenantSlug);
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  const bearer =
    authHeader?.startsWith('Bearer ') || authHeader?.startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;

  if (bearer) {
    return createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component — ignore.
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        } catch {
          // Called from a Server Component — ignore.
        }
      },
    },
  });
}
