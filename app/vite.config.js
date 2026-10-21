import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { computeEngineId } from './tools/engine-id.mjs';

const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// In produzione /api/* sono le funzioni Vercel in ../api (stesso codice). In dev e in preview le
// serviamo qui: legge solo i file locali (data/public/** se c'è, altrimenti ricostruisce da
// data/data.json), senza uscire in rete. Con DATA_ROOT=<cartella> si punta a un'altra radice
// che contenga data/public/** e/o data/data.json.
const API_NAMES = ['data', 'health', 'summary', 'night', 'insights', 'history', 'archive'];

function apiPlugin() {
  process.env.DATA_LOCAL_ONLY = '1';
  process.env.DATA_ROOT ||= repoRoot;
  const handlers = Object.fromEntries(
    API_NAMES.map((name) => [name, require(`../api/${name}.js`)]),
  );
  const handler = (req, res, next) => {
    const path = req.url?.split('?')[0];
    // Vecchio indirizzo della pagina statistiche: ora è una vista dell'app.
    if (path === '/statistiche.html') {
      res.statusCode = 308;
      res.setHeader('Location', '/#/statistiche');
      return res.end();
    }
    const name = path?.match(/^\/api\/([a-z]+)$/)?.[1];
    if (!name || !handlers[name]) return next();
    if (name === 'data') {
      // monolite: stesso comportamento della funzione, ma senza cache in dev
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(
        require('node:fs').readFileSync(`${process.env.DATA_ROOT}/data/data.json`, 'utf8'),
      );
    }
    Promise.resolve(handlers[name](req, res)).catch(next);
  };
  return {
    name: 'api-data',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  // Versione del motore `shared/` incorporata: gli insight precalcolati valgono solo se coincide.
  define: { __ENGINE_ID__: JSON.stringify(computeEngineId()) },
  build: {
    // la scena 3D (three.js, ~640 kB) è l'unico chunk grande ed è caricata in lazy
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // react e snapshot dati in chunk propri: cache stabile tra un deploy e l'altro
        // e nessun chunk d'ingresso sopra i 500 kB.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            { name: 'club-fallback', test: /fallback-data\.json/ },
          ],
        },
      },
    },
  },
});
