import { formatNumber } from '../../lib/format.js';
import { Swords } from '../../lib/icons.js';
import { POSITION_NAMES } from '../../lib/positions.js';
import { toNumber } from '../../lib/stats.js';

function DuelMetrics({ duelRole, duelSummaryA, duelSummaryB }) {
  return (
    <div className="lab-duel-metrics">
      {[
        ['Voto medio EA', duelSummaryA.rating, duelSummaryB.rating, 1],
        [
          'Gol / presenza',
          duelSummaryA.goals / duelSummaryA.games,
          duelSummaryB.goals / duelSummaryB.games,
          2,
        ],
        [
          'Assist / presenza',
          duelSummaryA.assists / duelSummaryA.games,
          duelSummaryB.assists / duelSummaryB.games,
          2,
        ],
        ['Passaggi riusciti %', duelSummaryA.pass, duelSummaryB.pass, 0],
        [
          'Contrasti / presenza',
          duelSummaryA.tackles / duelSummaryA.games,
          duelSummaryB.tackles / duelSummaryB.games,
          2,
        ],
        ...(duelRole === 'goalkeeper'
          ? [
              [
                'Parate / presenza',
                duelSummaryA.saves / duelSummaryA.games,
                duelSummaryB.saves / duelSummaryB.games,
                2,
              ],
            ]
          : []),
      ].map(([label, leftValue, rightValue, digits]) => {
        const left = leftValue;
        const right = rightValue;
        const total = Math.max(0.01, toNumber(left) + toNumber(right));
        return (
          <div key={String(label)} className="lab-duel-row">
            <b
              className={
                left !== null && right !== null && left > right ? 'ahead' : ''
              }
            >
              {formatNumber(left, Number(digits))}
            </b>
            <div>
              <span>{String(label)}</span>
              <div className="lab-duel-bar">
                <i
                  style={{
                    width: `${left === null || right === null ? 50 : (toNumber(left) / total) * 100}%`,
                  }}
                />
              </div>
            </div>
            <b
              className={
                left !== null && right !== null && right > left ? 'ahead' : ''
              }
            >
              {formatNumber(right, Number(digits))}
            </b>
          </div>
        );
      })}
    </div>
  );
}

export function DuelPanel({
  duelCandidates,
  duelPlayerA,
  duelPlayerB,
  duelRole,
  duelSummaryA,
  duelSummaryB,
  setDuelChoiceA,
  setDuelChoiceB,
  setDuelRole,
  sortedMatches,
}) {
  return (
    <div
      className="lab-panel"
      id="panel-duello"
      role="tabpanel"
      aria-labelledby="tab-duello"
    >
      <div className="lab-toolbar">
        <label>
          Stesso reparto
          <select
            value={duelRole}
            onChange={(event) => setDuelRole(event.target.value)}
          >
            {Object.entries(POSITION_NAMES).map(([role, roleName]) => (
              <option key={role} value={role}>
                {roleName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pro A
          <select
            value={duelPlayerA || ''}
            onChange={(event) => setDuelChoiceA(event.target.value)}
          >
            {duelCandidates.map((duelCandidate) => (
              <option key={duelCandidate}>{duelCandidate}</option>
            ))}
          </select>
        </label>
        <label>
          Pro B
          <select
            value={duelPlayerB || ''}
            onChange={(event) => setDuelChoiceB(event.target.value)}
          >
            {duelCandidates
              .filter((duelCandidate) => duelCandidate !== duelPlayerA)
              .map((duelCandidate) => (
                <option key={duelCandidate}>{duelCandidate}</option>
              ))}
          </select>
        </label>
      </div>
      {duelCandidates.length < 2 ? (
        <div className="lab-empty">
          <Swords size={32} />
          <h3>Il duello aspetta un avversario.</h3>
          <p>
            Servono almeno due Pro con una presenza in questo reparto nelle gare
            disponibili. Prova un altro reparto.
          </p>
        </div>
      ) : (
        <>
          <div className="lab-duel-names">
            <div>
              <strong>{duelPlayerA}</strong>
              <small>
                {duelSummaryA.games}
                {' presenze · '}
                {POSITION_NAMES[duelRole]}
              </small>
            </div>
            <span>VS</span>
            <div>
              <strong>{duelPlayerB}</strong>
              <small>
                {duelSummaryB.games}
                {' presenze · '}
                {POSITION_NAMES[duelRole]}
              </small>
            </div>
          </div>
          <DuelMetrics
            duelRole={duelRole}
            duelSummaryA={duelSummaryA}
            duelSummaryB={duelSummaryB}
          />
          <div className="lab-story">
            <span>COME LEGGERE IL CONFRONTO</span>
            <h3>Come leggere i numeri insieme.</h3>
            <p>
              Il voto racconta il giudizio EA; gol e assist raccontano
              produzione; passaggi e contrasti raccontano altre parti del
              lavoro. I valori per presenza rendono leggibili campioni diversi.
              Il confronto non corregge avversari, minuti o difficoltà delle
              gare.
            </p>
          </div>
        </>
      )}
      <p className="lab-note">
        {'Confronto sulle ultime '}
        {sortedMatches.length}
        {
          ' gare disponibili, solo nel reparto scelto. Le presenze possono appartenere a partite diverse. Percentuale passaggi calcolata sui tentativi totali; — significa nessun tentativo. Colore = valore più alto, non miglior giocatore in assoluto.'
        }
      </p>
    </div>
  );
}
