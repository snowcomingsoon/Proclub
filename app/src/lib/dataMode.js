// Quale percorso usa il sito per leggere i dati.
//  - 'legacy': il monolite /api/data (percorso collaudato)
//  - 'new': API modulari (summary, history, insights, health)
// Prova il nuovo percorso aprendo il sito con ?data=new. Se il nuovo percorso manda in errore la pagina,
// `forceLegacy` riporta la sessione sul percorso collaudato.
export const DEFAULT_MODE = 'legacy';
const SAFE_KEY = 'billocchi.data.safe';
let override = null;

const read = (storage, key) => {
  try {
    return globalThis[storage]?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export function getDataMode() {
  if (override) return override;
  if (read('sessionStorage', SAFE_KEY) === '1') return 'legacy';
  try {
    const query = new URLSearchParams(globalThis.location?.search || '').get('data');
    if (query === 'new' || query === 'legacy') return query;
  } catch {
    /* ignora */
  }
  return DEFAULT_MODE;
}

export function forceLegacy(reason) {
  override = 'legacy';
  try {
    globalThis.sessionStorage?.setItem(SAFE_KEY, '1');
  } catch {
    /* ignora */
  }
  console.error('[dati] percorso sicuro attivato:', reason);
}
