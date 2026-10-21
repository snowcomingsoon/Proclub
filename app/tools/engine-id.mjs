// Identificativo del motore di analisi: sha1 (12 caratteri esadecimali) di
// shared/metrics.mjs + shared/commentary.mjs concatenati, nell'ordine. Il front-end lo incorpora
// in fase di build; gli insight precalcolati sono usati solo se `insights.engine` coincide.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ENGINE_FILES = ['metrics.mjs', 'commentary.mjs'];

export function computeEngineId(
  sharedDir = fileURLToPath(new URL('../../shared/', import.meta.url)),
) {
  const hash = createHash('sha1');
  for (const file of ENGINE_FILES) hash.update(readFileSync(`${sharedDir}/${file}`));
  return hash.digest('hex').slice(0, 12);
}
