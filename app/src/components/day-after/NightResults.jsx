import {
  formatMatchTime,
  formatRating,
  formatScore,
} from '../../lib/format.js';
import { detectGaps } from '../../../../shared/gaps.mjs';
import {
  getOpponentName,
  getResultLetter,
  summarizeNight,
} from '../../lib/matches.js';

function NightGameScore({ game, index }) {
  return (
    <details className={`paper-score ${getResultLetter(game)}`}>
      <summary>
        <span>
          {'GARA '}
          {index + 1}
          {' · '}
          {formatMatchTime(game)}
        </span>
        <b>{formatScore(game)}</b>
        <small>{getOpponentName(game)}</small>
      </summary>
      <div className="paper-match-pros">
        {summarizeNight([game]).players.map((player) => (
          <div key={player.id}>
            <strong>{player.name}</strong>
            <span>
              {player.goals}
              {' G · '}
              {player.assists}
              {' A'}
            </span>
            <b>{formatRating(player.rating)}</b>
          </div>
        ))}
      </div>
    </details>
  );
}

export function NightResults({ nightStats, selectedNight }) {
  const gaps = detectGaps(selectedNight.games.map((game) => game.timestamp));
  const time = (timestamp) => formatMatchTime({ timestamp });
  return (
    <div className="paper-results">
      <div className="paper-record">
        <span>IL BILANCIO</span>
        <strong>
          {nightStats.wins}
          <small>V</small> {nightStats.draws}
          <small>P</small> {nightStats.losses}
          <small>S</small>
        </strong>
        <p>
          {nightStats.goals}
          {' fatti · '}
          {nightStats.against}
          {' subiti'}
        </p>
      </div>
      <div
        className="paper-score-strip"
        aria-label="Partite della serata, dalla prima all’ultima"
      >
        {selectedNight.games.map((game, index) => (
          <NightGameScore key={game.matchId} game={game} index={index} />
        ))}
      </div>
      {gaps.map((gap) => (
        <p key={gap.from} className="paper-gap-note" role="note">
          {`Tra le ${time(gap.from)} e le ${time(gap.to)} c’è un buco di ${gap.minutes} minuti: probabilmente ${gap.estimatedMissing === 1 ? 'una partita' : `${gap.estimatedMissing} partite`} giocata ma non restituita da EA. Non compare nei numeri della serata.`}
        </p>
      ))}
    </div>
  );
}
