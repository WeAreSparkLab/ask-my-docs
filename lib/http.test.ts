import { describe, expect, it } from 'vitest';
import { HttpError, errorResponse, getBearerToken, getClientIp, readJson, sseEvent } from './http';
import { getEnv } from './env';

const req = (headers: Record<string, string> = {}, body?: string) =>
  new Request('https://example.com/api/x', { method: 'POST', headers, body });

describe('getBearerToken', () => {
  it('extracts a JWT-shaped bearer token', () => {
    expect(getBearerToken(req({ authorization: 'Bearer aaa.bbb.ccc' }))).toBe('aaa.bbb.ccc');
  });
  it('rejects missing, malformed and non-JWT tokens', () => {
    expect(getBearerToken(req())).toBeNull();
    expect(getBearerToken(req({ authorization: 'Basic abc' }))).toBeNull();
    expect(getBearerToken(req({ authorization: 'Bearer notajwt' }))).toBeNull();
    expect(getBearerToken(req({ authorization: 'Bearer a.b.c extra' }))).toBeNull();
  });
});

describe('getClientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
  });
  it('falls back to x-real-ip then "unknown"', () => {
    expect(getClientIp(req({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
    expect(getClientIp(req())).toBe('unknown');
  });
});

describe('readJson', () => {
  it('parses valid JSON', async () => {
    expect(await readJson(req({}, '{"a":1}'))).toEqual({ a: 1 });
  });
  it('rejects invalid JSON with 400 and oversized bodies with 413', async () => {
    await expect(readJson(req({}, '{nope'))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(req({}, 'x'.repeat(100)), 50)).rejects.toMatchObject({ status: 413 });
  });
});

describe('errorResponse', () => {
  it('maps HttpError to its status and headers', async () => {
    const res = errorResponse(new HttpError(429, 'slow down', { 'Retry-After': '30' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(await res.json()).toEqual({ error: 'slow down' });
  });
  it('hides internal error details', async () => {
    const res = errorResponse(new Error('secret db password leaked'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});

describe('sseEvent', () => {
  it('formats a Server-Sent Events frame', () => {
    expect(sseEvent('delta', { text: 'hi\nthere' })).toBe(
      'event: delta\ndata: {"text":"hi\\nthere"}\n\n',
    );
  });
});

describe('getEnv', () => {
  const valid = {
    SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_ANON_KEY: 'x'.repeat(30),
    EMBED_SECRET: 'y'.repeat(32),
    ANTHROPIC_API_KEY: 'sk-test-1234567890',
    UPSTASH_REDIS_REST_URL: 'https://abc.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'z'.repeat(20),
  };
  it('applies defaults', () => {
    const env = getEnv(valid);
    expect(env.ANTHROPIC_MODEL).toBe('claude-haiku-5-5');
    expect(env.RATE_LIMIT_DEMO_PER_IP).toBe(10);
    expect(env.RATE_LIMIT_USER_PER_HOUR).toBe(30);
  });
  it('treats empty strings as missing and names the bad variables without echoing values', () => {
    expect.assertions(2);
    try {
      getEnv({ ...valid, ANTHROPIC_API_KEY: '', EMBED_SECRET: 'short' });
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/ANTHROPIC_API_KEY.*EMBED_SECRET|EMBED_SECRET.*ANTHROPIC_API_KEY/);
      expect(message).not.toContain('short');
    }
  });
});
