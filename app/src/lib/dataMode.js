// Quale percorso usa il sito per leggere i dati.
//  - 'legacy': il monolite /api/data (percorso collaudato)
//  - 'new': API modulari (summary, history, insights, health)
// Prova il nuovo percorso aprendo il sito con ?data=new. Se il nuovo percorso manda in errore la pagina,
// `forceLegacy` riporta la sessione sul percorso collaudato.
export const DEFAULT_MODE = 'legacy';
const SAFE_KEY = 'billocchi.data.safe';
let override = null;
let level = null;

const read = (storage, key) => {
  try {
    return globalThis[storage]?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

/** 0 = normale; 1 = percorso dati collaudato; 2 = anche senza lo stato di salute (aspetto di prima). */
export function safetyLevel() {
  if (level == null) level = Math.min(2, Number(read('sessionStorage', SAFE_KEY)) || 0);
  return level;
}

export function getDataMode() {
  if (override || safetyLevel() >= 1) return 'legacy';
  try {
    const query = new URLSearchParams(globalThis.location?.search || '').get('data');
    if (query === 'new' || query === 'legacy') return query;
  } catch {
    /* ignora */
  }
  return DEFAULT_MODE;
}

/** Un errore di pagina alza di un gradino il livello di sicurezza (max 2) per il resto della sessione. */
export function escalate(reason) {
  level = Math.min(2, safetyLevel() + 1);
  try {
    globalThis.sessionStorage?.setItem(SAFE_KEY, String(level));
  } catch {
    /* ignora */
  }
  console.error('[dati] livello di sicurezza', level, ':', reason);
  return level;
}

export const forceLegacy = escalate;
