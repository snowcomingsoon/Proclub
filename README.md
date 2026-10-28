# BILLOCCHI CLUB

Sito statistiche FC Pro Clubs del club BILLOCCHI CLUB (EA club `70375`, piattaforma `common-gen5`).

## Architettura

```
EA (proclubs.ea.com)
   │  GitHub Actions: update-data.yml (cadenza sotto)
   ▼
scripts/update-data.js ─► scripts/collector.js
   ├─ data/data.json            snapshot monolitico (compatibilità: test, api/data.js, fallback)
   ├─ data/collection-ledger.json, data/sync-status.json   registro di integrità e ultimo controllo
   ├─ data/matches/<id>.json    una partita completa per file (immutabile)
   ├─ data/archive/index.json   indice di tutte le partite mai archiviate
   ├─ data/backups/YYYY-MM.json.gz   backup mensile compresso dello snapshot
   ├─ data/seasons/<id>.json    snapshot delle stagioni EA concluse
   └─ data/public/              contratto dati pubblico (scritto in modo atomico)
        health.json  summary.json  insights.json  history.json  nights/<YYYY-MM-DD>.json
```

- `app/`: front-end Vite + React (vedi `app/README.md`); `api/data.js` serve lo snapshot a `/api/data`.
- `shared/`: motore di metriche e commenti (`metrics`, `commentary`, `editorial`...) e `session.mjs` (`sessionDay`: la "serata" nel fuso del club, notte fino alle 06:00).
- `config/club.json`: `clubId`, `platform`, `name`, `repo`, `timezone`, `nightEndsAtHour`. Le variabili d'ambiente (`EA_CLUB_ID`, `EA_PLATFORM`, `CLUB_NAME`, `GITHUB_REPOSITORY`, `CLUB_TIMEZONE`, `CLUB_NIGHT_ENDS_AT_HOUR`) fanno da override.
- `config/ea-shape.json`: schema (campi → tipi) delle risposte EA usato dal controllo settimanale.
- Secret opzionali per notifiche di nuove partite: `DISCORD_WEBHOOK`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT`.

## Cadenza della raccolta

`update-data.yml` non dipende da ChatGPT né da altri servizi: usa solo il `GITHUB_TOKEN` di Actions.

| Finestra (UTC) | Italia | Frequenza |
|---|---|---|
| 17:00–01:59 | 19–03 (estate), 18–02 (inverno) | ogni 20 minuti (minuti 0, 20, 40) |
| 02:00–16:59 | resto del giorno | ogni ora, al minuto 17 |

GitHub può ritardare le esecuzioni programmate. Per non produrre 144 commit al giorno, `data.json`, `sync-status.json`, il ledger e i file pubblici vengono riscritti solo se c'è qualcosa di significativo (nuove partite, contatori, errori, cambio stagione) oppure al massimo una volta all'ora come "battito" (tiene vivo il repository, i cui schedule GitHub disattiva dopo 60 giorni di inattività).

## File pubblici (`data/public/`)

Tutti JSON UTF-8, derivati solo da `data/data.json` + `shared/`, rigenerati a ogni raccolta (`npm run build:data` li ricostruisce a mano).

- `health.json`: `{version, checkedAt, capturedAt, complete, failures, stale, lostClubMatches, writtenOff[ultimi 20], pendingMissing[], unlisted:{pending, final[ultimi 20]}, season:{id, startedAt, lastChange, previous}, consecutiveFailures, failingSince, lastSuccessAt, engine:{ok, error?}}`
- `summary.json`: `{version:2, capturedAt, club, members:{members}, matches[≤30], nights:[{day, games, from, to}], matchCount, season}`
- `nights/<YYYY-MM-DD>.json`: `{day, matches[]}` (ora italiana, le gare tra 00:00 e 05:59 appartengono alla serata precedente)
- `insights.json`: `{version, builtAt, engine (hash dei sorgenti di shared/), coach:{<nome minuscolo>: commentFor(...)}, club: analyzeClub(...) senza il dettaglio per giocatore}`. Se il motore va in errore, `insights.json` non viene aggiornato e `health.engine.ok` è `false`: la raccolta continua.
- `history.json`: `{version:1, matchHistory[]}` con tutte le partite complete.

## Come leggere health e issue

`health.json` dice se l'ultima raccolta è completa (`complete`), quali letture sono fallite (`failures`), quali sono state scartate perché arretrate (`stale`), quante partite EA non ha mai elencato (`lostClubMatches`, `writtenOff`) e da quante esecuzioni consecutive fallisce (`consecutiveFailures`).

Il workflow `health-issue.yml` parte dopo ogni raccolta:

- apre l'issue **"Raccolta EA in errore"** dopo 3 esecuzioni consecutive fallite (o fallimenti ripetuti da oltre 2 ore), con il motivo;
- aggiunge un commento a ogni nuovo fallimento (al massimo uno all'ora);
- la chiude da sola alla prima esecuzione sana.

Non può far fallire la raccolta (job separato, `continue-on-error`, solo `issues: write`).

`ea-shape.yml` (ogni lunedì) confronta la forma delle risposte EA con `config/ea-shape.json` e gestisce allo stesso modo l'issue **"Formato EA cambiato"**.

## Runbook

**La raccolta si ferma** (issue "Raccolta EA in errore", sito con dati vecchi):
1. Apri l'esecuzione linkata nell'issue o `data/public/health.json` e leggi `failures`.
2. `EA ... HTTP 403/5xx` o timeout: di solito è EA, aspetta; l'issue si chiude da sola al ritorno alla normalità.
3. `integrity:*` (contatori arretrati o partite mancanti oltre la tolleranza di 12 ore): sono perdite lato EA (la lista partite contiene al massimo 10 gare per modalità). Controlla `writtenOff`; non serve intervenire.
4. `crash`/`archivio`/`dati pubblici`: errore nello script, guarda il log dell'esecuzione e correggi.
5. Se non parte più nulla: Actions → "Aggiorna dati EA" → *Run workflow*. Ogni esecuzione conserva comunque una copia di `data/` come artifact (30 giorni), anche se il push fallisce.

**La stagione cambia** (nuova stagione FC, contatori di club e Pro che ripartono da zero): è riconosciuta da sola quando club e quasi tutti i Pro tornano insieme a pochi valori, confermata da due letture consecutive. Lo snapshot concluso va in `data/seasons/<id>.json`, il ledger riparte da zero, `data.json` ricomincia dalla nuova stagione (le partite vecchie restano in `data/matches/` e nell'indice), e `health.season.lastChange` registra l'evento. Un calo isolato dei contatori NON è un cambio stagione: resta una lettura arretrata ignorata (`stale`). Se il riconoscimento non scattasse (reset parziale), archivia a mano `data/data.json` in `data/seasons/` e cancella `data/collection-ledger.json`.

**EA cambia formato** (issue "Formato EA cambiato"): l'issue elenca campi mancanti o tipi cambiati. Adegua `scripts/ea-client.js`/il front-end; quando le nuove risposte sono corrette, rigenera lo schema con *Run workflow → update* di `ea-shape.yml` (oppure `npm run check:ea-shape -- --update` in locale) e committa `config/ea-shape.json`. I campi nuovi non aprono issue: compaiono solo nel log.

## Sviluppo

- `npm test`: tutti i test (motore, raccolta, stagione, archivio, dati pubblici, issue, cadenza dei workflow).
- `npm run lint`: controllo sintattico (`node --check`) di script, `shared/`, API e test; gira in CI.
- `npm run build:data`: rigenera `data/public/` da `data/data.json` (non conta come una nuova esecuzione nel contatore dei fallimenti).
- `npm run update`: raccolta EA completa (richiede accesso a proclubs.ea.com).
- `npm run check:ea-shape`: controllo del formato EA (`-- --update` riscrive lo schema, `-- --from-data` lo ricava da `data.json`).

## Partite non listate da EA (ricostruzione)

A volte EA conta una partita nei contatori cumulativi (`club[0]`, `members[]`) ma non la restituisce in `clubs/matches`. `scripts/unlisted.js` (funzioni pure) la ricostruisce: stato `unlisted` nel ledger = `{base:{club, players, cutoff}, since, finals[]}`; deficit = totali correnti − `base` − contributo esatto (esito/gol da `clubs[id]`, presenze/gol/assist/MOTM/rossi da `players[id]`) delle partite archiviate con timestamp > `cutoff`. Vale solo se partite > 0, V+P+S = partite e tutte le componenti ≥ 0 (altrimenti avviso non bloccante in `unlisted.warning`; se dura 12 ore si ribasa dalla lettura corrente). Se la partita compare dopo in lista il deficit si riduce da solo. Dopo 12 ore (stessa scadenza del write-off del club) il deficit passa in `finals` (max 200) e `base` si ribasa sui contatori correnti. `since` = primo avvistamento, da cui il sito ricava la serata. `config/unlisted-seed.json` (generato con `node scripts/tools/make-unlisted-seed.js <commit>`) è il riferimento una tantum per un ledger esistente senza `unlisted`: usato solo se coerente con storico e contatori, altrimenti si parte dalla lettura corrente. `node scripts/tools/show-unlisted.js` stampa la ricostruzione sui dati del repository senza scrivere nulla. I numeri di `lostClubMatches`/`writtenOff` non cambiano.

Le partite uscite dagli ultimi dieci elenchi di EA prima di essere archiviate non sono ricostruibili.
