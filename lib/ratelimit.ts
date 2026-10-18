import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getEnv } from './env.js';
import { HttpError } from './http.js';

type Bucket = 'chat-ip' | 'chat-user' | 'ingest-user' | 'ingest-ip';

let redis: Redis | undefined;
const limiters = new Map<string, Ratelimit>();

function limiter(bucket: Bucket, limit: number, window: `${number} h` | `${number} d`): Ratelimit {
  const key = `${bucket}:${limit}:${window}`;
  let rl = limiters.get(key);
  if (!rl) {
    const env = getEnv();
    redis ??= new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `amd:${bucket}`,
      analytics: false,
    });
    limiters.set(key, rl);
  }
  return rl;
}

export interface LimitInfo {
  limit: number;
  remaining: number;
}

async function check(rl: Ratelimit, identifier: string, what: string): Promise<LimitInfo> {
  let result;
  try {
    result = await rl.limit(identifier);
  } catch {
    // Fail closed: if we cannot count, we cannot protect the (paid) model endpoint.
    throw new HttpError(503, 'Rate limiter unavailable. Please try again shortly.');
  }
  if (!result.success) {
    const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    const minutes = Math.ceil(retryAfter / 60);
    throw new HttpError(
      429,
      `${what} limit reached. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      { 'Retry-After': String(retryAfter) },
    );
  }
  return { limit: result.limit, remaining: result.remaining };
}

/**
 * Chat limits (per hour):
 *  - demo mode: RATE_LIMIT_DEMO_PER_IP per IP (anonymous, so the IP is the only handle)
 *  - logged in: RATE_LIMIT_USER_PER_HOUR per user, plus a generous per-IP backstop
 */
export async function limitChat(opts: {
  ip: string;
  userId?: string;
  demo: boolean;
}): Promise<LimitInfo> {
  const env = getEnv();
  if (opts.demo || !opts.userId) {
    return check(limiter('chat-ip', env.RATE_LIMIT_DEMO_PER_IP, '1 h'), opts.ip, 'Demo question');
  }
  await check(limiter('chat-ip', env.RATE_LIMIT_DEMO_PER_IP * 10, '1 h'), opts.ip, 'Question');
  return check(limiter('chat-user', env.RATE_LIMIT_USER_PER_HOUR, '1 h'), opts.userId, 'Question');
}

/** Uploads: 20 per user per day, 40 per IP per day. */
export async function limitIngest(opts: { ip: string; userId: string }): Promise<void> {
  await check(limiter('ingest-ip', 40, '1 d'), opts.ip, 'Upload');
  await check(limiter('ingest-user', 20, '1 d'), opts.userId, 'Upload');
}

export function rateLimitHeaders(info: LimitInfo): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(info.limit),
    'X-RateLimit-Remaining': String(info.remaining),
  };
}
