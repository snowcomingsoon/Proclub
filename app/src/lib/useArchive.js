import { useEffect, useState } from 'react';

async function readRows(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(String(response.status));
  const rows = await response.json();
  if (!Array.isArray(rows)) throw Error('shape');
  return rows;
}

/**
 * Archivio risultati: prima /api/archive (aggiornato a runtime, senza deploy), poi il file
 * statico /archive.json incluso nel build. `status` 'loading' | 'ready' | 'error'.
 */
export function useArchive() {
  const [state, setState] = useState({ status: 'loading', rows: [] });
  useEffect(() => {
    let alive = true;
    readRows('/api/archive')
      .catch(() => readRows('/archive.json'))
      .then((rows) => alive && setState({ status: 'ready', rows }))
      .catch(() => alive && setState({ status: 'error', rows: [] }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
