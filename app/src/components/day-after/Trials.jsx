import { Quote, Trophy } from 'lucide-react';
import { formatRating } from '../../lib/format.js';
import { POSITION_ABBREVIATIONS } from '../../lib/positions.js';
import { playerHref } from '../../lib/route.js';
import { AdaniComment } from '../AdaniComment.jsx';

function TrialCard({ index, isCoverPro, nightQuotes, player, trial }) {
  return (
    <details className={`paper-trial ${isCoverPro ? 'is-cover-pro' : ''}`}>
      <summary>
        <div className="paper-trial-top">
          <span>
            {'FASCICOLO '}
            {String(index + 1).padStart(2, '0')}
          </span>
          {isCoverPro && (
            <Trophy size={17} aria-label="Migliore delle gare registrate" />
          )}
          <b>
            {formatRating(player.rating)}
            <small>EA / 10</small>
          </b>
        </div>
        <h4>{player.name}</h4>
        <p className="paper-trial-title">{trial.title}</p>
        <div className="paper-trial-stats">
          <span>
            {player.games}
            {' PRES.'}
          </span>
          <span>
            {player.goals}
            {' GOL'}
          </span>
          <span>
            {player.assists}
            {' ASSIST'}
          </span>
        </div>
        <span className="paper-open-case">Leggi accusa e verdetto</span>
      </summary>
      <div className="paper-case-body">
        <a className="pg-link pg-link-case" href={playerHref(player.name)}>
          Pagina del giocatore
        </a>
        {trial.praise && (
          <div className="paper-praise">
            <span>IN SUO FAVORE</span>
            <p>{trial.praise}</p>
          </div>
        )}
        <blockquote>
          <span>L’ACCUSA DELLO SPOGLIATOIO</span>
          <Quote size={18} aria-hidden="true" />
          <p>{trial.charge}</p>
        </blockquote>
        <AdaniComment player={player} quote={nightQuotes.get(player.name)} />
        <details className="paper-verdict">
          <summary>Le prove e il verdetto</summary>
          <div>
            <span>AGLI ATTI</span>
            <p>{trial.proof}</p>
            <div className="paper-trial-evidence">
              <span>
                {player.passPct === null ? '—' : `${player.passPct}%`}
                {' passaggi'}
              </span>
              <span>
                {player.tackles}/{player.tackleAttempts}
                {' contrasti'}
              </span>
              <span>
                {player.saves}
                {' parate'}
              </span>
              <span>
                {player.reds}
                {' rossi'}
              </span>
            </div>
            <span>IL VERDETTO</span>
            <p>{trial.verdict}</p>
            {trial.coachNote && (
              <>
                <span>LA NOTA DELL’ALLENATORE</span>
                <p>{trial.coachNote}</p>
              </>
            )}
            <small>
              {'Reparti giocati: '}
              {player.roles
                .map((role) => POSITION_ABBREVIATIONS[role] || role)
                .join(' / ')}
              {'. Totali sulle '}
              {player.games}
              {' presenze registrate.'}
            </small>
          </div>
        </details>
      </div>
    </details>
  );
}

export function Trials({ nightQuotes, nightStats, trials }) {
  return (
    <section className="paper-trials" id="processo">
      <div className="paper-section-heading">
        <div>
          <span>02 / IL PROCESSO DEL PALLONE</span>
          <h3>
            Tutti sotto esame.
            <br />
            <em>Valutazioni con i numeri in mano.</em>
          </h3>
        </div>
        <p>
          Aspetti da migliorare, prove e verdetto per tutti quelli scesi in campo,
          con una nota di lavoro per le prossime gare. Le cifre sono di EA.
        </p>
      </div>
      <div className="paper-trial-grid">
        {trials.map(({ player, trial }, index) => {
          const isCoverPro = nightStats.winners.some(
            (winner) => winner.id === player.id,
          );
          return (
            <TrialCard
              key={player.id}
              index={index}
              isCoverPro={isCoverPro}
              nightQuotes={nightQuotes}
              player={player}
              trial={trial}
            />
          );
        })}
      </div>
    </section>
  );
}
