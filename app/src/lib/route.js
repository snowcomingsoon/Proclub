import { useEffect, useState } from 'react';

/**
 * Routing minimale su hash: `#/statistiche`, `#/pro/<nome>`; qualsiasi altro hash
 * (`#rosa`, `#top`, vuoto) resta la home con le sezioni a scorrimento.
 */
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  if (raw === '/costellazione' || raw === '/costellazione/') return { view: 'constellation', name: null };
  if (raw === '/statistiche' || raw === '/statistiche/')
    return { view: 'stats', name: null };
  if (raw.startsWith('/pro/')) {
    let name = raw.slice(5).replace(/\/$/, '');
    try {
      name = decodeURIComponent(name);
    } catch {
      /* nome malformato: resta com'è e verrà rifiutato */
    }
    return { view: 'player', name };
  }
  return { view: 'home', name: null };
}

export const playerHref = (name) => `#/pro/${encodeURIComponent(name)}`;
export const STATS_HREF = '#/statistiche';

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      const next = parseHash(location.hash);
      setRoute((prev) =>
        prev.view === next.view && prev.name === next.name ? prev : next,
      );
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
