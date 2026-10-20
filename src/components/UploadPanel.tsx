import { useRef, useState, type DragEvent } from 'react';
import { MAX_DOCUMENTS_PER_USER, uploadMetaSchema } from '../../lib/schemas';
import { uploadDocument } from '../lib/api';

export function UploadPanel(props: {
  token: string;
  documentCount: number;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const full = props.documentCount >= MAX_DOCUMENTS_PER_USER;

  const handle = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    setSuccess(null);
    if (full)
      return setError(`Document limit reached (${MAX_DOCUMENTS_PER_USER}). Delete one first.`);
    const meta = uploadMetaSchema.safeParse({ name: file.name, size: file.size });
    if (!meta.success) return setError(meta.error.issues[0].message);

    setBusy(true);
    try {
      await uploadDocument(file, props.token);
      setSuccess(`Added “${file.name}”.`);
      props.onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handle(e.dataTransfer.files[0]);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">Upload a document</h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-3 rounded-lg border-2 border-dashed p-5 text-center text-sm transition-colors ${
          dragging
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
            : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        <p className="text-slate-600 dark:text-slate-300">
          {busy ? 'Processing… large files can take up to a minute.' : 'Drop a file here, or'}
        </p>
        <button
          type="button"
          disabled={busy || full}
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".md,.txt,.pdf"
          className="hidden"
          onChange={(e) => void handle(e.target.files?.[0])}
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          .md, .txt or .pdf · max 2 MB · {props.documentCount}/{MAX_DOCUMENTS_PER_USER} documents
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          {success}
        </p>
      )}
    </div>
  );
}
