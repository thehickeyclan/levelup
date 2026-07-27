import { API_URL, TENANT_SLUG } from './config';
import { supabase } from './supabase';
import { getSelectedCoachId } from './coach-preview';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('x-tenant-slug', TENANT_SLUG);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  const selectedCoachId = await getSelectedCoachId();
  if (selectedCoachId) {
    headers.set('x-levelup-coach-id', selectedCoachId);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(
      typeof json === 'object' && json && 'error' in json && json.error
        ? String(json.error)
        : `Request failed (${res.status})`,
      res.status
    );
  }
  return json;
}
