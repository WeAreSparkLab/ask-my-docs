import { getEnv } from './env.js';
import { HttpError } from './http.js';
import { embedResponseSchema } from './schemas.js';

const BATCH_SIZE = 16;
const CONCURRENCY = 3;
const TIMEOUT_MS = 45_000;

async function embedBatch(texts: string[]): Promise<number[][]> {
  const env = getEnv();
  let res: Response;
  try {
    res = await fetch(`${env.SUPABASE_URL}/functions/v1/amd-embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-embed-secret': env.EMBED_SECRET },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'The embedding service did not respond');
  }
  if (!res.ok) {
    console.error('embed function returned', res.status);
    throw new HttpError(502, 'The embedding service failed');
  }
  const parsed = embedResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success || parsed.data.embeddings.length !== texts.length) {
    throw new HttpError(502, 'The embedding service returned an unexpected response');
  }
  return parsed.data.embeddings;
}

/** Embeds texts (384-dim gte-small) in small batches with limited concurrency, preserving order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) batches.push(texts.slice(i, i + BATCH_SIZE));

  const results: number[][][] = new Array(batches.length);
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const i = next++;
      results[i] = await embedBatch(batches[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return results.flat();
}
