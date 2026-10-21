import { useEffect, useState } from 'react';

/** Archivio risultati (/archive.json): una lettura, `status` 'loading' | 'ready' | 'error'. */
export function useArchive() {
  const [state, setState] = useState({ status: 'loading', rows: [] });
  useEffect(() => {
    let alive = true;
    fetch('/archive.json')
      .then((response) => {
        if (!response.ok) throw Error();
        return response.json();
      })
      .then((rows) => {
        if (!Array.isArray(rows)) throw Error();
        alive && setState({ status: 'ready', rows });
      })
      .catch(() => alive && setState({ status: 'error', rows: [] }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
