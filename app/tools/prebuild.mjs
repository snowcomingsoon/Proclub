// Copia best-effort dei dati nel sito statico (solo come fallback: il sito preferisce le API /api/*).
// Non fa mai fallire il build: se un file manca, lo salta e lo dice.
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

function attempt(label, fn) {
  try {
    fn();
  } catch (error) {
    console.warn(`prebuild: ${label} non copiato (${error.message})`);
  }
}

mkdirSync(pub(''), { recursive: true });

// Monolite: fallback di /api/data e dei visitatori senza API.
if (existsSync(root('data/data.json')))
  attempt('data.json', () => copyFileSync(root('data/data.json'), pub('data.json')));
else console.warn('prebuild: data/data.json assente, salto');

// Archivio risultati: il sito legge prima /api/archive, poi /archive.json.
if (existsSync(root('data/archive/index.json')))
  attempt('archive.json', () => copyFileSync(root('data/archive/index.json'), pub('archive.json')));
else attempt('archive.json', () => writeFileSync(pub('archive.json'), '[]'));

// File pubblici del contratto dati, se esistono: fallback statico sotto /data-public/.
rmSync(pub('data-public'), { recursive: true, force: true });
if (existsSync(root('data/public')))
  attempt('data/public', () => cpSync(root('data/public'), pub('data-public'), { recursive: true }));
