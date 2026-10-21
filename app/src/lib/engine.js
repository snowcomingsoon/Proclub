/**
 * Identificativo del motore `shared/` incorporato in questo bundle (vedi app/tools/engine-id.mjs).
 * Fuori da Vite (test in Node) non è definito: `null` = nessun insight precalcolato è considerato valido.
 */
export const ENGINE_ID =
  typeof __ENGINE_ID__ === 'string' ? __ENGINE_ID__ : null; // eslint-disable-line no-undef
