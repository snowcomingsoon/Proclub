import { useState } from 'react';
import { formatRating } from '../lib/format.js';
import { buildGradeComments, buildGradeRows } from '../lib/grades.js';
import { useClub } from '../lib/useClub.js';

/** Tabella dei voti EA (stagione, ultima serata, ultime 15 gare) con commento per Pro. */
export function PerformanceGrades({ members, matches }) {
  const { club } = useClub();
  const [sortKey, setSortKey] = useState('name');
  const [openName, setOpenName] = useState(null);
  const grades = buildGradeRows(members, matches, club.id);
  const sortedRows = [...grades.rows].sort((a, b) =>
    sortKey === 'name'
      ? a.name.localeCompare(b.name)
      : (b[sortKey] ?? -1) - (a[sortKey] ?? -1),
  );
  const openRow = grades.rows.find((row) => row.name === openName);
  const openIndex = grades.rows.findIndex((row) => row.name === openName);
  return (
    <section className="content performance-grades" id="voti">
      <div className="section-head">
        <div>
          <span className="overline">IL RENDIMENTO / VOTI SU 10</span>
          <h2>Tre voti. Un colpo d’occhio.</h2>
          <p className="sub">
            Stagione, ultima serata e forma recente. Le medie EA sono separate
            dall’overall dell’avatar.
          </p>
        </div>
        <label>
          Ordina per
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
          >
            <option value="name">Nome</option>
            <option value="season">Stagione</option>
            <option value="evening">Ultima serata</option>
            <option value="recent">Ultime 15 gare</option>
          </select>
        </label>
      </div>
      <div className="grades-scroll">
        <table className="grades-table">
          <thead>
            <tr>
              <th>PRO</th>
              <th>
                STAGIONE<small>Dall’inizio · tutti i ruoli</small>
              </th>
              <th>
                ULTIMA SERATA
                <small>
                  {grades.nightDate
                    ? new Date(
                        grades.nightDate + 'T12:00:00Z',
                      ).toLocaleDateString('it-IT', {
                        day: 'numeric',
                        month: 'short',
                      })
                    : '—'}
                  {' · '}
                  {grades.nightGames}
                  {' gare analizzate'}
                </small>
              </th>
              <th>
                ULTIME 15 GARE
                <small>{grades.windowSize}/15 gare in archivio</small>
              </th>
              <th>LETTURA</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((sortedRow) => (
              <tr key={sortedRow.name}>
                <th scope="row">{sortedRow.name}</th>
                <td>
                  <b>{formatRating(sortedRow.season)}</b>
                  <small>
                    {sortedRow.seasonGames}
                    {' presenze stagionali'}
                  </small>
                </td>
                <td>
                  <b>{formatRating(sortedRow.evening)}</b>
                  <small>
                    {sortedRow.eveningGames}
                    {' presenze con voto'}
                  </small>
                </td>
                <td>
                  <b>{formatRating(sortedRow.recent)}</b>
                  <small>
                    {sortedRow.recentGames}
                    {' presenze con voto'}
                  </small>
                </td>
                <td>
                  <button
                    onClick={() =>
                      setOpenName(
                        openName === sortedRow.name ? null : sortedRow.name,
                      )
                    }
                    aria-expanded={openName === sortedRow.name}
                    aria-controls="grade-comment"
                  >
                    {openName === sortedRow.name ? 'Chiudi' : 'Commento'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openRow && (
        <div id="grade-comment" className="grade-selected">
          <span className="overline">
            {openRow.name}
            {' / LETTURA DEL RENDIMENTO'}
          </span>
          <h3>
            {openRow.evening !== null && openRow.season !== null
              ? openRow.evening >= openRow.season + 0.3
                ? 'Una serata sopra il suo riferimento.'
                : openRow.evening <= openRow.season - 0.3
                  ? 'Una prova sotto la sua media stagionale.'
                  : 'La serata segue il suo livello stagionale.'
              : 'Il rendimento prende forma.'}
          </h3>
          <p>
            {openRow.season === null
              ? ''
              : `La stagione vale ${formatRating(openRow.season)} di media EA in ${openRow.seasonGames} presenze. `}
            {openRow.evening === null
              ? 'Assente dalle gare dell’ultima serata in archivio. '
              : `Nell’ultima serata la media è ${formatRating(openRow.evening)} in ${openRow.eveningGames} presenze. `}
            {openRow.recent === null
              ? ''
              : `La finestra recente vale ${formatRating(openRow.recent)} in ${openRow.recentGames} presenze sulle ultime ${grades.windowSize} gare del club.`}
          </p>
          {openRow.session && (
            <>
              <strong>IL CALCIO CHE HA PORTATO</strong>
              <p>{buildGradeComments(openRow.session, openIndex).positive}</p>
              <strong>DOVE SERVE QUALITÀ IN PIÙ</strong>
              <p>{buildGradeComments(openRow.session, openIndex).negative}</p>
            </>
          )}
        </div>
      )}
      <details className="grade-method">
        <summary>Come leggere i voti</summary>
        <p>
          Stagione: media cumulativa fornita da EA. Serata: media delle presenze
          nella sessione più recente, unita oltre mezzanotte fino alle 06:00
          italiane. Ultime 15: media delle presenze nelle 15 gare più recenti
          conservate; se sono meno, il numero è dichiarato. Assenze e voti
          mancanti non valgono zero. Tutti i reparti sono inclusi e nessuna
          media è corretta per ruolo o minuti. Questi sono voti EA, non indici
          di forma del sito.
        </p>
      </details>
    </section>
  );
}
