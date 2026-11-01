import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildLiveData,
  isValidHealth,
  isValidHistory,
  isValidSummary,
  normalizeMatches,
  withPlayingMembers,
} from './adapter.js';
import { CLUBS, withClubParam } from './constants.js';
import { fallbackForClub } from './data.js';
import { getDataMode, safetyLevel } from './dataMode.js';
import { ENGINE_ID } from './engine.js';

const REFRESH_INTERVAL_MS = 60_000;

/** GET JSON; `cache: 'no-cache'` = il browser rivalida con l'ETag (304 quasi gratis). */
async function getJson(url, cache = 'no-cache') {
  const response = await fetch(url, { cache });
  if (!response.ok) throw Error(String(response.status));
  return response.json();
}

/** `?v=<capturedAt>` aggira la cache di bordo solo dopo un cambio segnalato da /api/health. */
function clubUrl(path, clubKey, bust) {
  const base = withClubParam(path, clubKey);
  if (!bust) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${encodeURIComponent(bust)}`;
}

/** Percorso modulare: summary + history + insights (opzionali) in parallelo. */
async function loadModular(clubKey, clubId, bust) {
  const [summary, history, insights] = await Promise.all([
    getJson(clubUrl('/api/summary', clubKey, bust)),
    getJson(clubUrl('/api/history', clubKey, bust)),
    getJson(clubUrl('/api/insights', clubKey, bust)).catch(() => null),
  ]);
  if (!isValidSummary(summary) || !isValidHistory(history)) throw Error('shape');
  return buildLiveData({ summary, history, insights, engineId: ENGINE_ID, clubId });
}

/** Rete di sicurezza: il monolite /api/data (stessa forma di sempre). */
async function loadMonolith(clubKey, clubId, bust) {
  const payload = await getJson(clubUrl('/api/data', clubKey, bust), 'no-store');
  if (!payload.club?.[0] || !payload.members?.members) throw Error('shape');
  return {
    ...payload,
    matchHistory: normalizeMatches(payload.matchHistory || payload.matches, clubId),
  };
}

const connectionOf = (fresh = []) =>
  ['club', 'members', 'matches'].every((key) => fresh.includes(key))
    ? 'yes'
    : fresh.length
      ? 'partial'
      : 'no';

/**
 * Dati del club selezionato (`billocchi` o `faida`). Parte dal fallback incorporato del club;
 * poi legge /api/summary (+ history e insights in parallelo). Ogni 60 secondi (e al focus)
 * interroga /api/health e rilegge i dati se `capturedAt` è cambiato.
 */
export function useClubData(clubKey = 'billocchi') {
  const spec = CLUBS[clubKey] || CLUBS.billocchi;
  const [state, setState] = useState(() => ({
    clubKey: spec.key,
    data: withPlayingMembers(fallbackForClub(spec.key)),
    connection: 'loading',
    freshKeys: [],
    lastSync: undefined,
    refreshing: false,
    health: null,
  }));
  const seen = useRef({ clubKey: spec.key, capturedAt: null, bust: null, live: false });
  const sequence = useRef(0);

  // Cambio club istantaneo: espone subito lo snapshot del club richiesto mentre parte il fetch live.
  if (seen.current.clubKey !== spec.key) {
    seen.current = { clubKey: spec.key, capturedAt: null, bust: null, live: false };
    sequence.current += 1;
  }

  const effectiveData =
    state.clubKey === spec.key
      ? state.data
      : withPlayingMembers(fallbackForClub(spec.key));
  const effectiveHealth = state.clubKey === spec.key ? state.health : null;
  const effectiveConnection = state.clubKey === spec.key ? state.connection : 'loading';
  const effectiveFresh = state.clubKey === spec.key ? state.freshKeys : [];
  const effectiveSync = state.clubKey === spec.key ? state.lastSync : undefined;
  const effectiveRefreshing = state.clubKey === spec.key ? state.refreshing : false;

  const load = useCallback(async (bust) => {
    const targetKey = spec.key;
    const targetId = spec.id;
    const mine = ++sequence.current;
    let payload;
    try {
      if (getDataMode() !== 'new' && targetKey === 'billocchi') throw Error('percorso collaudato');
      payload = await loadModular(targetKey, targetId, bust);
    } catch {
      try {
        payload = await loadMonolith(targetKey, targetId, bust);
      } catch {
        if (mine === sequence.current && seen.current.clubKey === targetKey && !seen.current.live) {
          setState((prev) => ({
            ...(prev.clubKey === targetKey
              ? prev
              : {
                  clubKey: targetKey,
                  data: withPlayingMembers(fallbackForClub(targetKey)),
                  freshKeys: [],
                  lastSync: undefined,
                  refreshing: false,
                  health: null,
                }),
            connection: 'no',
          }));
        }
        return false;
      }
    }
    if (mine !== sequence.current || seen.current.clubKey !== targetKey) return false;
    if (seen.current.live && Date.parse(payload.capturedAt) < Date.parse(seen.current.capturedAt))
      return false;
    seen.current.live = true;
    const changedCapture = seen.current.capturedAt !== payload.capturedAt;
    seen.current.capturedAt = payload.capturedAt;
    const nextData = changedCapture ? withPlayingMembers(payload) : null;
    setState((prev) => ({
      clubKey: targetKey,
      data: nextData || (prev.clubKey === targetKey ? prev.data : withPlayingMembers(payload)),
      connection: connectionOf(payload.fresh),
      freshKeys: payload.fresh || [],
      lastSync: new Date().toISOString(),
      refreshing: prev.clubKey === targetKey ? prev.refreshing : false,
      health: prev.clubKey === targetKey ? prev.health : null,
    }));
    return true;
  }, [spec.key, spec.id]);

  const poll = useCallback(async () => {
    const targetKey = spec.key;
    let next = null;
    try {
      const body = await getJson(withClubParam('/api/health', targetKey), 'no-store');
      if (isValidHealth(body)) next = body;
    } catch {
      /* health non raggiungibile: sotto si rivalida il summary */
    }
    if (seen.current.clubKey !== targetKey) return;
    if (next && safetyLevel() < 2) {
      setState((prev) =>
        prev.clubKey === targetKey ? { ...prev, health: next } : prev,
      );
      const known = seen.current;
      const changed = next.capturedAt !== known.capturedAt;
      if (!known.live || changed) {
        known.bust = next.capturedAt;
        await load(known.live ? next.capturedAt : undefined);
      } else {
        setState((prev) =>
          prev.clubKey === targetKey ? { ...prev, lastSync: new Date().toISOString() } : prev,
        );
      }
      return;
    }
    await load();
  }, [load, spec.key]);

  const refresh = useCallback(async () => {
    const targetKey = spec.key;
    setState((prev) => ({ ...prev, clubKey: targetKey, refreshing: true }));
    try {
      await load(effectiveHealth?.capturedAt);
      if (safetyLevel() < 2) {
        try {
          const body = await getJson(withClubParam('/api/health', targetKey), 'no-store');
          if (isValidHealth(body) && seen.current.clubKey === targetKey) {
            setState((prev) =>
              prev.clubKey === targetKey ? { ...prev, health: body } : prev,
            );
          }
        } catch {
          /* nessun effetto visibile */
        }
      }
    } finally {
      setState((prev) =>
        prev.clubKey === targetKey ? { ...prev, refreshing: false } : prev,
      );
    }
  }, [load, effectiveHealth?.capturedAt, spec.key]);

  useEffect(() => {
    const targetKey = spec.key;
    setState({
      clubKey: targetKey,
      data: withPlayingMembers(fallbackForClub(targetKey)),
      connection: 'loading',
      freshKeys: [],
      lastSync: undefined,
      refreshing: false,
      health: null,
    });
    load();
    if (safetyLevel() < 2) {
      getJson(withClubParam('/api/health', targetKey), 'no-store')
        .then((body) => {
          if (isValidHealth(body) && seen.current.clubKey === targetKey) {
            setState((prev) =>
              prev.clubKey === targetKey ? { ...prev, health: body } : prev,
            );
          }
        })
        .catch(() => {});
    }
    const tick = () => {
      if (!document.hidden) poll();
    };
    const interval = setInterval(tick, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', tick);
    };
  }, [load, poll, spec.key]);

  return {
    data: effectiveData,
    connection: effectiveConnection,
    freshKeys: effectiveFresh,
    lastSync: effectiveSync,
    refreshing: effectiveRefreshing,
    refresh,
    health: effectiveHealth,
  };
}
