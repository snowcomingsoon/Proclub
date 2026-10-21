import { useCallback, useEffect, useState } from 'react';
import { fallbackData } from './data.js';

const REFRESH_INTERVAL_MS = 60_000;

/** Toglie dal sito i profili EA senza presenze. */
export function withPlayingMembers(data) {
  const members = data.members?.members;
  if (!Array.isArray(members)) return data;
  return {
    ...data,
    members: {
      ...data.members,
      members: members.filter((member) => Number(member.gamesPlayed) > 0),
    },
  };
}

/**
 * Dati del club: parte dal fallback incorporato, poi li rilegge da /api/data
 * all'avvio, ogni 60 secondi e quando la finestra torna in primo piano.
 *
 * `connection`: 'loading' | 'yes' (lettura EA completa) | 'partial' | 'no' (dati salvati).
 */
export function useClubData() {
  const [data, setData] = useState(() => withPlayingMembers(fallbackData));
  const [connection, setConnection] = useState('loading');
  const [freshKeys, setFreshKeys] = useState([]);
  const [lastSync, setLastSync] = useState();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/data', { cache: 'no-store' });
      if (!response.ok) throw Error();
      const payload = await response.json();
      if (!payload.club?.[0] || !payload.members?.members) throw Error();
      setData(withPlayingMembers(payload));
      setFreshKeys(payload.fresh || []);
      setConnection(
        ['club', 'members', 'matches'].every((key) =>
          payload.fresh?.includes(key),
        )
          ? 'yes'
          : payload.fresh?.length
            ? 'partial'
            : 'no',
      );
      setLastSync(new Date().toISOString());
    } catch {
      setConnection('no');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { data, connection, freshKeys, lastSync, refreshing, refresh };
}
