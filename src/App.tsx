import { useState } from 'react';
import { AuthForm } from './components/AuthForm';
import { Chat } from './components/Chat';
import { DocumentList } from './components/DocumentList';
import { UploadPanel } from './components/UploadPanel';
import { useDocuments } from './hooks/useDocuments';
import { useSession } from './hooks/useSession';
import { deleteDocument } from './lib/api';
import { isConfigured, supabase } from './lib/supabase';

const DEMO_EXAMPLES = [
  'What projects are in the corpus?',
  'Which project uses a vector database?',
  'How do I run one of the projects locally?',
];

function Workspace({ token, email }: { token: string; email: string }) {
  const [mode, setMode] = useState<'demo' | 'mine'>('mine');
  const demo = mode === 'demo';
  const { documents, loading, error, refresh } = useDocuments({ demo, token });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Document source"
          className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800"
        >
          {(['mine', 'demo'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                mode === m ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {m === 'mine' ? 'My documents' : 'Demo corpus'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="truncate">{email}</span>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          {!demo && (
            <UploadPanel token={token} documentCount={documents.length} onUploaded={refresh} />
          )}
          <DocumentList
            title={demo ? 'Demo corpus' : 'Your documents'}
            documents={documents}
            loading={loading}
            error={error}
            emptyText={
              demo ? 'The demo corpus is empty.' : 'No documents yet. Upload one to get started.'
            }
            onDelete={
              demo
                ? undefined
                : async (id) => {
                    await deleteDocument(id, token);
                    refresh();
                  }
            }
          />
        </div>
        <Chat
          key={mode}
          demo={demo}
          token={token}
          examples={demo ? DEMO_EXAMPLES : undefined}
          disabledReason={
            !demo && !loading && documents.length === 0
              ? 'Upload a document to start asking questions.'
              : undefined
          }
        />
      </div>
    </>
  );
}

function DemoOnly() {
  const { documents, loading, error } = useDocuments({ demo: true });
  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-4">
        <AuthForm />
        <DocumentList
          title="Demo corpus"
          documents={documents}
          loading={loading}
          error={error}
          emptyText="The demo corpus is empty."
        />
      </div>
      <Chat demo examples={DEMO_EXAMPLES} />
    </div>
  );
}

export default function App() {
  const { session, loading } = useSession();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-semibold">Ask My Docs</h1>
          <p className="hidden text-sm text-slate-500 sm:block dark:text-slate-400">
            Answers from your documents, with citations
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {!isConfigured ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            Missing configuration: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see
            .env.example).
          </p>
        ) : loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : session ? (
          <Workspace token={session.access_token} email={session.user.email ?? 'signed in'} />
        ) : (
          <DemoOnly />
        )}
      </main>
    </div>
  );
}
