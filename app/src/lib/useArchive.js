import { useEffect, useState } from 'react';
import { CLUBS, withClubParam } from './constants.js';

async function readRows(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(String(response.status));
  const rows = await response.json();
  if (!Array.isArray(rows)) throw Error('shape');
  return rows;
}

/**
 * Archivio risultati del club attivo: prima /api/archive (aggiornato a runtime, senza deploy),
 * poi il file statico incluso nel build. `status` 'loading' | 'ready' | 'error'.
 */
export function useArchive(clubKey = 'billocchi') {
  const spec = CLUBS[clubKey] || CLUBS.billocchi;
  const [state, setState] = useState({ clubKey: spec.key, status: 'loading', rows: [] });
  useEffect(() => {
    let alive = true;
    setState({ clubKey: spec.key, status: 'loading', rows: [] });
    readRows(withClubParam('/api/archive', spec.key))
      .catch(() => readRows(spec.archiveStaticUrl))
      .then((rows) => alive && setState({ clubKey: spec.key, status: 'ready', rows }))
      .catch(() => alive && setState({ clubKey: spec.key, status: 'error', rows: [] }));
    return () => {
      alive = false;
    };
  }, [spec.key, spec.archiveStaticUrl]);
  return state.clubKey === spec.key ? state : { status: 'loading', rows: [] };
}
