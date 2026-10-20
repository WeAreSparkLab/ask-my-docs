import { useEffect, useRef, useState, type FormEvent } from 'react';
import { splitCitations } from '../lib/citations';
import { useChat, type ChatMessage } from '../hooks/useChat';
import { CitationChip, SourcePanel } from './CitationChip';

function AssistantMessage({ message }: { message: ChatMessage }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const parts = splitCitations(message.content, message.sources.length);
  const open = message.sources.find((s) => s.id === openId);
  const toggle = (id: number) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <div>
      <p className="leading-relaxed break-words whitespace-pre-wrap">
        {parts.map((part, i) =>
          part.type === 'text' ? (
            <span key={i}>{part.text}</span>
          ) : (
            <CitationChip
              key={i}
              id={part.id}
              active={openId === part.id}
              onToggle={() => toggle(part.id)}
            />
          ),
        )}
        {message.status === 'streaming' && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-slate-400 align-middle" />
        )}
      </p>
      {message.status === 'error' && message.error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {message.error}
        </p>
      )}
      {message.status !== 'streaming' && message.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>Sources:</span>
          {message.sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              aria-expanded={openId === s.id}
              className={`max-w-48 truncate rounded-full border px-2 py-0.5 transition-colors ${
                openId === s.id
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 hover:border-indigo-400 dark:border-slate-700'
              }`}
            >
              {s.id} · {s.title}
            </button>
          ))}
        </div>
      )}
      {open && <SourcePanel source={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export function Chat(props: {
  demo: boolean;
  token?: string;
  examples?: string[];
  disabledReason?: string;
}) {
  const { messages, busy, send, stop, reset } = useChat({ demo: props.demo, token: props.token });
  const [question, setQuestion] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = question.trim();
    if (q.length < 3 || busy || props.disabledReason) return;
    setQuestion('');
    void send(q);
  };

  return (
    <section className="flex min-h-[28rem] flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="font-semibold">
          {props.demo ? 'Ask the demo corpus' : 'Ask your documents'}
        </h2>
        {messages.length > 0 && (
          <button type="button" onClick={reset} className="text-sm text-slate-500 hover:underline">
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>
              {props.disabledReason ?? 'Ask a question. Answers cite the passages they come from.'}
            </p>
            {!props.disabledReason && props.examples && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {props.examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void send(ex)}
                    className="rounded-full border border-slate-300 px-3 py-1 text-slate-700 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 break-words whitespace-pre-wrap text-white">
                {m.content}
              </p>
            </div>
          ) : (
            <AssistantMessage key={m.id} message={m} />
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
      >
        <label className="sr-only" htmlFor="question">
          Your question
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          disabled={Boolean(props.disabledReason)}
          placeholder={props.disabledReason ?? 'Ask a question…'}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60 dark:border-slate-700"
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-lg border border-slate-300 px-4 py-2 font-medium dark:border-slate-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={question.trim().length < 3 || Boolean(props.disabledReason)}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Ask
          </button>
        )}
      </form>
    </section>
  );
}
