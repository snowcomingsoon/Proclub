import { ArrowUpRight } from 'lucide-react';
import { collectionStatusOf } from '../lib/adapter.js';
import { CLUB_ID, EA_CLUBS_URL } from '../lib/constants.js';
import { lostMatchesNote, stallNotice } from '../lib/health.js';

const FRESH_LABELS = {
  club: 'club',
  members: 'giocatori',
  matches: 'partite',
  membersCore: 'gol, assist e presenze dei giocatori',
};

const formatDateTime = (isoDate) => new Date(isoDate).toLocaleString('it-IT');

/** Frase di stato sulla sincronizzazione con EA, in base all'ultima lettura. */
function describeSync({ connection, freshKeys, lastSync, capturedAt }) {
  if (connection === 'yes' && lastSync) {
    return `Lettura EA completa: ${formatDateTime(lastSync)}`;
  }
  if (connection === 'partial' && lastSync) {
    const updated = freshKeys.map((key) => FRESH_LABELS[key] || key).join(', ');
    return `Lettura parziale: ${formatDateTime(lastSync)}. Aggiornati: ${updated}; gli altri dati restano alla rilevazione del ${formatDateTime(capturedAt)}.`;
  }
  return `Ultima rilevazione EA: ${formatDateTime(capturedAt)}. Il server EA limita la connessione diretta; i dati vengono sincronizzati periodicamente.`;
}

export function SiteFooter({ connection, data, freshKeys, lastSync, health }) {
  const status = collectionStatusOf(health, data);
  const stall = stallNotice(health);
  const lost = lostMatchesNote(health);
  return (
    <footer>
      <img
        className="site-logo"
        src="/logo-billocchi.svg"
        alt=""
        width="40"
        height="40"
        loading="lazy"
        decoding="async"
      />
      <strong>BILLOCCHI CLUB · FC 27</strong>
      <p>
        Dati EA SPORTS FC Clubs. Raccolta ogni 3 minuti durante la fascia serale, avvio programmato ogni ora nel resto della giornata;
        verifica sul sito ogni 60 secondi durante la visita.
        <br />
        {describeSync({
          connection,
          freshKeys,
          lastSync,
          capturedAt: data.capturedAt,
        })}
      </p>
      {status&&<p role="status">
        Controllo archivio: {status.complete?'nessuna nuova discrepanza rilevata':'raccolta da verificare, recupero automatico in corso'}.
        {' '}Ultimo controllo EA: {formatDateTime(status.checkedAt)}.
        {!stall&&Date.now()-Date.parse(status.checkedAt)>45*60*1000&&' Il controllo è in ritardo da oltre 45 minuti.'}
        {status.issues?.length>0&&<details><summary>Dettagli della copertura</summary><ul>{status.issues.map(i=><li key={i.key}>{i.name||'Archivio'}: {i.kind==='missing_appearances'?`${i.missing} nuove presenze senza tabellino completo`:i.kind==='missing_matches'?`${i.missing} nuove partite da riconciliare`:i.kind==='counter_regression'?'contatore EA diminuito: verifica necessaria':i.kind==='unverified_player'?'identità da verificare nei tabellini':i.kind==='incomplete_match_details'?`${i.count} tabellini incompleti`:'dati da verificare'}</li>)}</ul></details>}
        {status.startedAt&&<><br/>Il controllo riguarda le nuove gare dal {formatDateTime(status.startedAt)}. Lo storico precedente può essere incompleto.</>}
      </p>}
      {lost&&<p>{lost}</p>}
      {stall&&<p role="status">{stall}</p>}
      <a
        href={`${EA_CLUBS_URL}/overview?clubId=${CLUB_ID}&platform=common-gen5`}
        target="_blank"
        rel="noreferrer"
      >
        {'Profilo EA '}
        <ArrowUpRight size={14} />
      </a>
    </footer>
  );
}
