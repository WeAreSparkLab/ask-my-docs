import { useCallback, useEffect, useState } from 'react';
import { listDocuments, type DocumentRow } from '../lib/api';

export function useDocuments(opts: { demo: boolean; token?: string }) {
  const { demo, token } = opts;
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    listDocuments({ demo, token })
      .then((docs) => {
        if (!active) return;
        setDocuments(docs);
        setError(null);
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [demo, token, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { documents, loading, error, refresh };
}
