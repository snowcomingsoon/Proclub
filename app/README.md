# BILLOCCHI CLUB — front-end sorgente (Vite + React 19)

Ricostruzione modificabile del sito compilato in `site/` (bundle vinext/Next).
Il codice è stato ricavato dal chunk reale `site/_next/static/chunks/page-*.js`
e poi reso leggibile; l'aspetto e il comportamento sono identici al sito live.

## Comandi

```bash
cd app
npm install
npm run dev       # dev server con /api/* serviti in locale da ../data (vedi sotto)
npm run build     # build di produzione in app/dist
npm run preview   # serve dist (anche /api/*, vedi vite.config.js)
npm run lint
```

## Dati: API modulari, polling leggero, deploy disaccoppiati

I dati arrivano **a runtime**, non dal build. La raccolta scrive file JSON in `data/public/`
(repo pubblica); le funzioni Vercel in `api/` li leggono da
`https://raw.githubusercontent.com/${DATA_REPO||'snowcomingsoon/Proclub'}/main/data/public/...`
(timeout 4 s, nessun token) e, se GitHub non risponde, dai file inclusi nel deploy
(`includeFiles: data/**`). Risposte con `ETag` (304 su `If-None-Match`) e
`Cache-Control: public, s-maxage=60, stale-while-revalidate=600` (health: 30 s).

| Endpoint | Contenuto |
|---|---|
| `/api/health` | salute della raccolta (`checkedAt`, `capturedAt`, `lostClubMatches`...), piccolo |
| `/api/summary` | club, Pro, ultime partite, elenco serate |
| `/api/night?day=YYYY-MM-DD` | partite complete di una serata (giorno validato, errori JSON) |
| `/api/history` | tutte le partite complete |
| `/api/insights` | commenti e analisi di squadra precalcolati (204 se assenti) |
| `/api/archive` | archivio risultati (`data/archive/index.json`) |
| `/api/data` | monolite `data/data.json` (compatibilità e rete di sicurezza) |

Il front-end (`src/lib/useClubData.js`) all'avvio legge summary, history e insights in parallelo;
poi **ogni 60 secondi e al focus solo `/api/health`**: se `capturedAt` è cambiato rilegge i dati
(`?v=<capturedAt>` aggira la cache di bordo solo in quel caso; il browser rivalida con l'ETag).
Se le API modulari non rispondono ricade su `/api/data` e infine sullo snapshot incorporato
(`src/lib/fallback-data.json`), senza errori visibili. `src/lib/adapter.js` compone i dati nella
forma `{club, members, matches, matchHistory, capturedAt, fresh}` attesa dai calcoli di `lib/`.

**Insight precalcolati.** `insights.json` è usato (`data.insights`) solo se: `engine` coincide con
l'identificativo del motore incorporato (`app/tools/engine-id.mjs`: sha1, 12 caratteri, di
`shared/metrics.mjs` + `shared/commentary.mjs`), è stato costruito dopo la rilevazione
(`builtAt` >= `capturedAt` meno 2 minuti) e l'elenco dei Pro coincide con quello del sito
(solo `gamesPlayed > 0`). Altrimenti si ricalcola nel browser, con lo stesso testo
(`test/app-data.test.mjs`). Il motore `shared/` resta nel bundle: Il giorno dopo e il Match studio
usano le metriche per Pro (`buildAll`), che non sono negli insight.

**Salute nel sito.** Il footer mostra "Ultimo controllo EA" (da `health.checkedAt`), le partite
non restituite da EA (`lostClubMatches`, solo se > 0) e, se la raccolta è ferma da più di 3 ore tra
le 19:00 e le 03:00 (o più di 12 ore negli altri momenti, ora italiana), una nota sobria
(`src/lib/health.js`).

In dev/preview gli stessi handler di `api/` sono serviti da `vite.config.js`, solo in locale:
leggono `data/public/**` se esiste, altrimenti ricostruiscono tutto da `data/data.json`
(`DATA_ROOT=<cartella>` per puntare a un'altra radice, es. le fixture).

### Deploy: i commit di soli dati non ripubblicano il sito

`vercel.json` ha `ignoreCommand: "bash app/tools/vercel-ignore.sh || exit 1"`: Vercel **salta il
build solo se tutti i file cambiati nell'ultimo commit stanno in `data/`**. Ogni dubbio fa
buildare: primo deploy o clone con un solo commit (nessun `HEAD^`), `git diff` in errore,
nessun file cambiato, anche un solo file fuori da `data/`. Il sito vede comunque i dati nuovi,
perché li legge a runtime da `/api/*`. Conseguenza: i file statici `public/data.json`,
`public/archive.json` e lo snapshot incorporato restano all'ultimo deploy di codice (sono solo
fallback). **Per disattivarlo**: togliere `ignoreCommand` da `vercel.json`.
Provare lo script in locale: `bash app/tools/vercel-ignore.sh; echo $?` (0 = salta, 1 = builda).

### Prebuild e fallback incorporati

`npm run build` esegue `tools/prebuild.mjs`: copia, senza mai far fallire il build,
`data/data.json` in `public/data.json`, l'archivio in `public/archive.json` (o `[]`) e, se esiste,
`data/public/` in `public/data-public/`. Il sito funziona anche senza nessuno di questi file:
preferisce le API e ha lo snapshot in `src/lib/fallback-data.json`.

### Fixture e qualità

- `node app/tools/make-fixtures.mjs` ricava `test/fixtures/public/*` (contratto dati) da `data/data.json`.
- `npm run lint` (eslint, regole minime: errori reali e regole degli hook; in CI nel job `frontend`).
- Controllo di tipo (`tsc --checkJs`): non attivato. Il codice di `src/` è per lo più JS senza JSDoc,
  ereditato da un bundle ricostruito: il controllo darebbe centinaia di falsi positivi e aggiungerebbe
  la dipendenza `typescript` (~20 MB) per un beneficio basso; le funzioni dell'adattatore sono invece
  coperte da test (`test/app-data.test.mjs`).

## Struttura

```
index.html            head identico a site/index.html (title, og, favicon, lang=it)
public/               asset statici copiati da site/ (cards/, models/, logo, data.json,
                      archive.json, robots.txt, 404.html)
src/main.jsx          createRoot + stili
src/styles.css        CSS originale (site/_next/static/css/index.*.css)
src/App.jsx           composizione delle sezioni
src/vendor/adani-scene.js   chunk three.js della scena 3D (importato in lazy da AdaniMini)
src/lib/              dati e calcoli puri
  useClubData.js        /api/summary+history+insights all'avvio, poi solo /api/health ogni 60 s + fallback
  adapter.js health.js  contratto dati -> forma dei calcoli; note sulla salute della raccolta
  fallback-data.json    snapshot embedded usato prima della prima risposta
  data.js constants.js stats.js format.js positions.js matches.js
  newsroom.js           copertina, svolte, processo, trend del "Giorno dopo"
  grades.js             voti e commenti per Pro
  season-profile.js     ritratto stagionale
  adani-quotes.js       archivio citazioni e abbinamento ai Pro
  card-profile.js       indice di forma / colore delle figurine
  icons.js              icona Swords a linee (come nel sito originale)
src/components/       sezioni UI
  DayAfter + day-after/ "Il giorno dopo" (gazzetta)
  Overview, AnalysisRoom, PerformanceGrades, Squad (+CollectorCard, SeasonProfile),
  MatchLab + match-lab/ ("Lo spogliatoio": studio / curva / testa a testa),
  MatchArchive, SiteHeader, SiteFooter, SectionNav, CountUp, Reveal, AdaniMini, AdaniComment
```

## Viste a pagina intera (hash routing)

`src/lib/route.js` interpreta l'hash: `#/statistiche` (`StatsPage`: record, classifica Pro
con tab/ordinamento, testa a testa, archivio per mese, bilancio avversari da `/archive.json`)
e `#/pro/<nome>` (`PlayerPage`: figurina, forma con grafico SVG dei voti per gara, numeri a gara
vs mediana dei pari ruolo, punti di forza/deboli e nota dal motore `shared/`, con/senza e coppie
solo se il motore li produce, serate recenti). Nome non valido: redirect a `#rosa`; Pro senza
presenze: stato vuoto. `/statistiche.html` reindirizza a `/#/statistiche` (`vercel.json` e plugin
Vite in dev/preview). Stili in `src/pages.css`. I voti per gara vengono da `matchHistory`
(l'archivio contiene solo i risultati).

## Verifica di parità (Playwright)

Confronto fatto contro https://billocchi-club-omega.vercel.app/ con gli stessi dati
(`/api/data` = `data/data.json`):

- screenshot full page a 1280 e 390 px: 0 pixel di differenza (animazioni congelate);
- console senza errori su entrambe le versioni;
- interazioni (select serata, protagonista, dettagli aperti, commenti voti, dialog
  figurina con Esc/click esterno, tab Match studio / La mia curva / Testa a testa
  con tutte le select e l'ordinamento, tastiera sulle tab, copia riepilogo,
  refresh dati): stesso testo della pagina dopo ogni passo, 37 snapshot × 2 viewport.

Il DOM differisce solo per l'ordine degli attributi e `selected=""` sulle `<option>`
(artefatti del rendering SSR del sito originale); la pagina qui è un SPA client-side,
quindi non c'è HTML pre-renderizzato.

## Note

- La scena 3D (`AdaniMini`) carica `/models/adani-mini.glb` quando entra in viewport.
- Le dipendenze del bundle originale non sono state aggiornate: il chunk three.js è
  vendorizzato così com'è (minificato) in `src/vendor/adani-scene.js`.
- Possibili passi successivi: sostituire il chunk three.js con `three` da npm
  (ricostruendo la scena dai sorgenti), test sui calcoli in `src/lib/` (`test/app-lib.test.mjs`, eseguiti da `npm test` alla radice),
  prerendering statico per SEO/anteprime.

## Prestazioni e mobile

- **Code splitting** (`vite.config.js`, `App.jsx`): l'ingresso carica solo header e "Il giorno dopo";
  `BelowFold` (tabellone, voti, rosa, spogliatoio, archivio), `SiteFooter` e `CardDialog` sono chunk
  lazy (il dialog si precarica quando il browser è libero), la scena 3D resta lazy. `react` e lo
  snapshot dati (`club-fallback`) hanno chunk propri. `SectionNav` ricalcola ancore e fade-in quando
  `BelowFold` è montato (link `#voti` ecc. funzionano anche a freddo).
- **Misure** (build, gzip): ingresso 567 kB (143) → 116 kB (40) + react 219 kB (68) + dati 189 kB (23);
  nessun chunk d'ingresso sopra 500 kB. Scena 3D 640 kB, solo on demand.
  Playwright, 390 px, CPU x4, rete 1,6 Mbps/150 ms, mediana di 5: prima render 2256 → 1936 ms,
  FCP 1996 → 1784 ms, byte trasferiti a caricamento completo 1,09 MB → 0,51 MB.
- **Immagini**: miniature 144x216 per la classifica (`public/cards/thumb/`, 7-9 kB, al posto di
  figurine 768x1152 da ~125 kB l'una); ritratto we_belen ridotto a 600 px (216 → 83 kB);
  `loading="lazy"`/`decoding="async"`/`width`/`height` sulle immagini non critiche; `preconnect` ai
  font e preload del solo stemma.
- **Mobile** (`src/mobile.css`, solo override dopo `styles.css`; sopra 700 px lo stile desktop è
  invariato): bersagli di tocco da 44 px (nav, select, summary, link, chiusura dialog), tabelle voti e
  match studio con prima colonna fissa e didascalia leggibile, link flottante "Statistiche avanzate"
  più piccolo e nascosto con il dialog aperto, contrasti sotto soglia corretti. Nessuno scroll
  orizzontale a 360/390/430/768/1280 px.
- **`prefers-reduced-motion`**: già coperto da `styles.css` (animazioni a 0,01 ms, reveal e fade
  visibili), `CountUp`, `SectionNav` (scroll istantaneo) e scena 3D (ferma); verificato che non resti
  nessuna animazione infinita in esecuzione.
