import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In produzione /api/data è servito da api/data.js (Vercel) alla radice del repo.
// In dev e in preview lo serviamo leggendo data/data.json.
const dataFile = fileURLToPath(new URL('../data/data.json', import.meta.url));

function apiDataPlugin() {
  const handler = (req, res, next) => {
    // Vecchio indirizzo della pagina statistiche: ora è una vista dell'app.
    if (req.url?.split('?')[0] === '/statistiche.html') {
      res.statusCode = 308;
      res.setHeader('Location', '/#/statistiche');
      return res.end();
    }
    if (req.url?.split('?')[0] !== '/api/data') return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(readFileSync(dataFile, 'utf8'));
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
  plugins: [react(), apiDataPlugin()],
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
