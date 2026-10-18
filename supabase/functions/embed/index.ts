// Supabase Edge Function: embeds text with the built-in gte-small model (384 dimensions).
// Only callable server-to-server: requests must carry the shared secret in `x-embed-secret`.
// Deploy with JWT verification off (we authenticate with the secret instead):
//   supabase functions deploy embed --no-verify-jwt
//   supabase secrets set EMBED_SECRET=<same value as in Vercel>

const MAX_TEXTS = 32;
const MAX_CHARS = 8000;

const model = new Supabase.ai.Session('gte-small');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Constant-time string comparison to avoid leaking the secret through timing.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('EMBED_SECRET');
  const provided = req.headers.get('x-embed-secret') ?? '';
  if (!secret || !safeEqual(provided, secret)) return json({ error: 'Unauthorized' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const texts = (body as { texts?: unknown })?.texts;
  if (
    !Array.isArray(texts) ||
    texts.length < 1 ||
    texts.length > MAX_TEXTS ||
    texts.some((t) => typeof t !== 'string' || t.length < 1 || t.length > MAX_CHARS)
  ) {
    return json(
      { error: `"texts" must be 1-${MAX_TEXTS} non-empty strings of at most ${MAX_CHARS} chars` },
      400,
    );
  }

  try {
    const embeddings: number[][] = [];
    for (const text of texts as string[]) {
      const output = await model.run(text, { mean_pool: true, normalize: true });
      embeddings.push(Array.from(output as Iterable<number>));
    }
    return json({ embeddings });
  } catch (err) {
    console.error('embedding failed', err);
    return json({ error: 'Embedding failed' }, 500);
  }
});
