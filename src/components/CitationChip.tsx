import type { Source } from '../lib/api';

export function CitationChip(props: { id: number; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-expanded={props.active}
      aria-label={`Source ${props.id}`}
      className={`mx-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-md px-1 align-baseline text-xs font-semibold transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-indigo-500 ${
        props.active
          ? 'bg-indigo-600 text-white'
          : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900'
      }`}
    >
      {props.id}
    </button>
  );
}

export function SourcePanel({ source, onClose }: { source: Source; onClose: () => void }) {
  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
            [{source.id}] {source.title}
          </p>
          {source.heading && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{source.heading}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            match {(source.similarity * 100).toFixed(0)}%
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            aria-label="Close source"
          >
            ✕
          </button>
        </div>
      </div>
      <p className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
        {source.content}
      </p>
    </div>
  );
}
