import { createSseParser } from './sse';

export interface DocumentRow {
  id: string;
  title: string;
  filename: string;
  size_bytes: number;
  chunk_count: number;
  is_public: boolean;
  created_at: string;
}

export interface Source {
  id: number;
  documentId: string;
  title: string;
  heading: string | null;
  content: string;
  similarity: number;
}

export type ChatEvent =
  | { type: 'sources'; sources: Source[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; stopReason: string | null }
  | { type: 'error'; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function failure(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
}

export async function listDocuments(opts: {
  demo: boolean;
  token?: string;
}): Promise<DocumentRow[]> {
  const res = await fetch(opts.demo ? '/api/documents?demo=1' : '/api/documents', {
    headers: authHeaders(opts.token),
  });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { documents: DocumentRow[] }).documents;
}

export async function deleteDocument(id: string, token: string): Promise<void> {
  const res = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw await failure(res);
}

export async function uploadDocument(file: File, token: string): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) throw await failure(res);
}

/** Streams a chat answer. Throws ApiError for HTTP-level failures (auth, rate limit, validation). */
export async function* streamChat(opts: {
  question: string;
  demo: boolean;
  token?: string;
  signal?: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(opts.token) },
    body: JSON.stringify({ question: opts.question, demo: opts.demo }),
    signal: opts.signal,
  });
  if (!res.ok) throw await failure(res);
  if (!res.body) throw new ApiError(500, 'The server sent an empty response');

  const queue: ChatEvent[] = [];
  const parser = createSseParser(({ event, data }) => {
    try {
      const payload = JSON.parse(data);
      if (event === 'sources') queue.push({ type: 'sources', sources: payload });
      else if (event === 'delta') queue.push({ type: 'delta', text: payload.text });
      else if (event === 'done')
        queue.push({ type: 'done', stopReason: payload.stopReason ?? null });
      else if (event === 'error') queue.push({ type: 'error', message: payload.message });
    } catch {
      /* ignore malformed frames */
    }
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
      while (queue.length) yield queue.shift()!;
    }
  } finally {
    reader.releaseLock();
  }
}
