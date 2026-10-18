import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';
import { HttpError, getBearerToken } from './http.js';

/**
 * Supabase client that acts as the calling user: it uses the anon key plus the user's JWT, so
 * Row Level Security applies. (Without a token it acts as `anon`, which can only read public rows.)
 * The service-role key is deliberately never used in /api.
 */
export function createUserClient(token?: string | null): SupabaseClient {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

export interface AuthedUser {
  id: string;
  token: string;
  db: SupabaseClient;
}

/** Verifies the bearer token with Supabase Auth. Returns null when absent or invalid. */
export async function getUser(request: Request): Promise<AuthedUser | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  const db = createUserClient(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, token, db };
}

export async function requireUser(request: Request): Promise<AuthedUser> {
  const user = await getUser(request);
  if (!user) throw new HttpError(401, 'Please log in to continue');
  return user;
}
