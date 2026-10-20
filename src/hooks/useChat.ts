import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, type Source } from '../lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Source[];
  status: 'streaming' | 'done' | 'error';
  error?: string;
}

export function useChat(opts: { demo: boolean; token?: string }) {
  const { demo, token } = opts;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const busy = messages.some((m) => m.status === 'streaming');

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Switching between demo / my documents starts a fresh conversation.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [demo]);

  const update = (id: string, patch: (m: ChatMessage) => Partial<ChatMessage>) =>
    setMessages((all) => all.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)));

  const send = useCallback(
    async (question: string) => {
      const assistantId = crypto.randomUUID();
      setMessages((all) => [
        ...all,
        { id: crypto.randomUUID(), role: 'user', content: question, sources: [], status: 'done' },
        { id: assistantId, role: 'assistant', content: '', sources: [], status: 'streaming' },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        for await (const event of streamChat({
          question,
          demo,
          token,
          signal: controller.signal,
        })) {
          if (event.type === 'sources') update(assistantId, () => ({ sources: event.sources }));
          else if (event.type === 'delta')
            update(assistantId, (m) => ({ content: m.content + event.text }));
          else if (event.type === 'error')
            update(assistantId, () => ({ status: 'error', error: event.message }));
          else if (event.type === 'done')
            update(assistantId, (m) => ({
              status: m.status === 'error' ? 'error' : 'done',
              error:
                event.stopReason === 'refusal' ? 'The model declined to answer this one.' : m.error,
            }));
        }
        update(assistantId, (m) => (m.status === 'streaming' ? { status: 'done' } : {}));
      } catch (err) {
        if (controller.signal.aborted) {
          update(assistantId, (m) => ({
            status: m.content ? 'done' : 'error',
            error: m.content ? undefined : 'Stopped.',
          }));
        } else {
          update(assistantId, () => ({
            status: 'error',
            error: err instanceof Error ? err.message : 'Something went wrong.',
          }));
        }
      }
    },
    [demo, token],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  return { messages, busy, send, stop, reset };
}
