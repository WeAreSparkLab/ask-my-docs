import { z } from 'zod';

const serverEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  EMBED_SECRET: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().min(10),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-haiku-5-5'),
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10),
  RATE_LIMIT_DEMO_PER_IP: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_USER_PER_HOUR: z.coerce.number().int().positive().default(30),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Validates server env vars once. Throws a message naming the missing/invalid variables only. */
export function getEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  if (source === process.env && cached) return cached;
  // Treat empty strings (e.g. unset lines copied from .env.example) as missing.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = serverEnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Invalid server configuration. Check env vars: ${names.join(', ')}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
