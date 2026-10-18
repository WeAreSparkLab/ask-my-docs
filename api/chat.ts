import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '../lib/env.js';
import { embedTexts } from '../lib/embed.js';
import { HttpError, errorResponse, getClientIp, readJson, sseEvent } from '../lib/http.js';
import { buildPrompt } from '../lib/prompt.js';
import { limitChat, rateLimitHeaders } from '../lib/ratelimit.js';
import { MATCH_COUNT, chatRequestSchema } from '../lib/schemas.js';
import { createUserClient, getUser } from '../lib/supabase.js';

interface MatchRow {
  id: number;
  document_id: string;
  document_title: string;
  chunk_index: number;
  content: string;
  metadata: { heading?: string | null } | null;
  similarity: number;
}

const NO_CONTEXT_MESSAGE =
  "I couldn't find anything relevant in the documents. Try uploading a document first or rephrasing your question.";

let anthropic: Anthropic | undefined;

/**
 * POST /api/chat  { question, demo }
 * Responds with a Server-Sent Events stream:
 *   event: sources  data: [{ id, documentId, title, heading, content, similarity }]
 *   event: delta    data: { text }          (repeated)
 *   event: done     data: { stopReason }
 *   event: error    data: { message }       (only if the model call fails mid-stream)
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = chatRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const { question, demo } = parsed.data;

    // Demo mode is anonymous and read-only over the public corpus. Otherwise login is required.
    const user = demo ? null : await getUser(request);
    if (!demo && !user) throw new HttpError(401, 'Please log in, or try the demo');

    const limits = await limitChat({
      ip: getClientIp(request),
      userId: user?.id,
      demo,
    });

    const [queryEmbedding] = await embedTexts([question]);
    const db = user?.db ?? createUserClient();
    const { data, error } = await db.rpc('amd_match_chunks', {
      query_embedding: queryEmbedding,
      match_count: MATCH_COUNT,
      only_public: demo,
    });
    if (error) {
      console.error('amd_match_chunks failed:', error.code);
      throw new HttpError(500, 'Search failed');
    }
    const matches = (data ?? []) as MatchRow[];

    const sources = matches.map((m, i) => ({
      id: i + 1,
      documentId: m.document_id,
      title: m.document_title,
      heading: m.metadata?.heading ?? null,
      content: m.content,
      similarity: Number(m.similarity.toFixed(4)),
    }));

    const encoder = new TextEncoder();
    const send = (controller: ReadableStreamDefaultController<Uint8Array>, e: string, d: unknown) =>
      controller.enqueue(encoder.encode(sseEvent(e, d)));

    const headers = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      ...rateLimitHeaders(limits),
    };

    // Nothing retrieved: answer without spending a model call.
    if (matches.length === 0) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          send(controller, 'sources', []);
          send(controller, 'delta', { text: NO_CONTEXT_MESSAGE });
          send(controller, 'done', { stopReason: 'no_context' });
          controller.close();
        },
      });
      return new Response(body, { headers });
    }

    const env = getEnv();
    anthropic ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const prompt = buildPrompt(
      question,
      matches.map((m) => ({
        documentTitle: m.document_title,
        heading: m.metadata?.heading ?? null,
        content: m.content,
      })),
    );

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        send(controller, 'sources', sources);
        const stream = anthropic!.messages.stream({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: prompt.system,
          messages: prompt.messages,
        });
        request.signal.addEventListener('abort', () => stream.abort());
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              send(controller, 'delta', { text: event.delta.text });
            }
          }
          const final = await stream.finalMessage();
          send(controller, 'done', { stopReason: final.stop_reason });
        } catch (err) {
          if (!request.signal.aborted) {
            const status = err instanceof Anthropic.APIError ? err.status : 'unknown';
            console.error('Anthropic stream failed, status:', status);
            send(controller, 'error', { message: 'The model could not answer. Please try again.' });
          }
        } finally {
          controller.close();
        }
      },
      cancel() {
        /* client disconnected; the abort listener above stops the upstream request */
      },
    });

    return new Response(body, { headers });
  } catch (err) {
    return errorResponse(err);
  }
}
