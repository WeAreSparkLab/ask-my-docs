import { useState } from 'react';
import type { DocumentRow } from '../lib/api';

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentList(props: {
  title: string;
  documents: DocumentRow[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async (doc: DocumentRow) => {
    if (!props.onDelete || !window.confirm(`Delete “${doc.title}” and all its passages?`)) return;
    setDeleting(doc.id);
    setDeleteError(null);
    try {
      await props.onDelete(doc.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">{props.title}</h2>
      {props.loading && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
      {props.error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {props.error}
        </p>
      )}
      {deleteError && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {deleteError}
        </p>
      )}
      {!props.loading && !props.error && props.documents.length === 0 && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{props.emptyText}</p>
      )}
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {props.documents.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{doc.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatSize(doc.size_bytes)} · {doc.chunk_count} passages
              </p>
            </div>
            {props.onDelete && (
              <button
                type="button"
                disabled={deleting === doc.id}
                onClick={() => void remove(doc)}
                className="shrink-0 rounded-md px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
                aria-label={`Delete ${doc.title}`}
              >
                {deleting === doc.id ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
