import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildLiveData,
  isValidHealth,
  isValidHistory,
  isValidSummary,
  normalizeMatches,
  withPlayingMembers,
} from './adapter.js';
import { fallbackData } from './data.js';
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
const versioned = (path, bust) =>
  bust ? `${path}?v=${encodeURIComponent(bust)}` : path;

/** Percorso modulare: summary + history + insights (opzionali) in parallelo. */
async function loadModular(bust) {
  const [summary, history, insights] = await Promise.all([
    getJson(versioned('/api/summary', bust)),
    getJson(versioned('/api/history', bust)),
    getJson(versioned('/api/insights', bust)).catch(() => null),
  ]);
  if (!isValidSummary(summary) || !isValidHistory(history)) throw Error('shape');
  return buildLiveData({ summary, history, insights, engineId: ENGINE_ID });
}

/** Rete di sicurezza: il monolite /api/data (stessa forma di sempre). */
async function loadMonolith(bust) {
  const payload = await getJson(versioned('/api/data', bust), 'no-store');
  if (!payload.club?.[0] || !payload.members?.members) throw Error('shape');
  return {
    ...payload,
    matchHistory: normalizeMatches(payload.matchHistory || payload.matches),
  };
}

const connectionOf = (fresh = []) =>
  ['club', 'members', 'matches'].every((key) => fresh.includes(key))
    ? 'yes'
    : fresh.length
      ? 'partial'
      : 'no';

/**
 * Dati del club. Parte dal fallback incorporato; poi legge /api/summary (+ history e insights
 * in parallelo). Da lì ogni 60 secondi (e al focus) interroga solo /api/health, minuscolo, e
 * rilegge i dati se `capturedAt` è cambiato. Se le API modulari non rispondono ricade su
 * /api/data e infine sul fallback incorporato, senza errori visibili.
 *
 * `connection`: 'loading' | 'yes' (lettura EA completa) | 'partial' | 'no' (dati salvati).
 * `health`: ultimo health.json letto (o null).
 */
export function useClubData() {
  const [data, setData] = useState(() => withPlayingMembers(fallbackData));
  const [connection, setConnection] = useState('loading');
  const [freshKeys, setFreshKeys] = useState([]);
  const [lastSync, setLastSync] = useState();
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState(null);
  const seen = useRef({ capturedAt: null, bust: null, live: false });
  const sequence = useRef(0);

  /** Rilegge i dati (modulari, poi monolite). Ignora risposte superate da una richiesta più recente. */
  const load = useCallback(async (bust) => {
    const mine = ++sequence.current;
    let payload;
    try {
      if (getDataMode() !== 'new') throw Error('percorso collaudato');
      payload = await loadModular(bust);
    } catch {
      try {
        payload = await loadMonolith(bust);
      } catch {
        if (mine === sequence.current && !seen.current.live) setConnection('no');
        return false;
      }
    }
    if (mine !== sequence.current) return false;
    // Never replace a newer snapshot with an older CDN or deployment fallback.
    if (seen.current.live && Date.parse(payload.capturedAt) < Date.parse(seen.current.capturedAt)) return false;
    seen.current.live = true;
    if (seen.current.capturedAt !== payload.capturedAt) {
      seen.current.capturedAt = payload.capturedAt;
      setData(withPlayingMembers(payload));
    }
    setFreshKeys(payload.fresh || []);
    setConnection(connectionOf(payload.fresh));
    setLastSync(new Date().toISOString());
    return true;
  }, []);

  /** Un giro di polling: solo /api/health; rilegge i dati solo se è cambiato `capturedAt`. */
  const poll = useCallback(async () => {
    let next = null;
    try {
      const body = await getJson('/api/health', 'no-store');
      if (isValidHealth(body)) next = body;
    } catch {
      /* health non raggiungibile: sotto si rivalida il summary */
    }
    if (next && safetyLevel() < 2) {
      setHealth(next);
      const known = seen.current;
      // Ritenta a ogni polling finché la versione annunciata non è stata effettivamente caricata.
      const changed = next.capturedAt !== known.capturedAt;
      if (!known.live || changed) {
        known.bust = next.capturedAt;
        await load(known.live ? next.capturedAt : undefined);
      } else {
        setLastSync(new Date().toISOString());
      }
      return;
    }
    await load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(health?.capturedAt);
      if (safetyLevel() < 2) {
        try {
          const body = await getJson('/api/health', 'no-store');
          if (isValidHealth(body)) setHealth(body);
        } catch {
          /* nessun effetto visibile */
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, [load, health]);

  useEffect(() => {
    // Avvio: dati modulari subito (la salute arriva in parallelo), poi solo health.
    load();
    if (safetyLevel() < 2) {
      getJson('/api/health', 'no-store')
        .then((body) => isValidHealth(body) && setHealth(body))
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
  }, [load, poll]);

  return { data, connection, freshKeys, lastSync, refreshing, refresh, health };
}
