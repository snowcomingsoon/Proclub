import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { clubReading } from '../../../shared/editorial.mjs';
import { getEditorialContext } from '../lib/editorial-ctx.js';
import { ratio, toNumber } from '../lib/stats.js';
import { useClub } from '../lib/useClub.js';
import { AnalysisRoom } from './AnalysisRoom.jsx';
import { CountUp } from './CountUp.jsx';

function RecordPanel({ club, reading }) {
  const wins = toNumber(club.wins);
  const ties = toNumber(club.ties);
  const losses = toNumber(club.losses);
  const gamesPlayed = Math.max(1, toNumber(club.gamesPlayed));
  return (
    <div className="record panel">
      <span className="label">RECORD TOTALE</span>
      <div className="record-numbers">
        <strong>
          <CountUp value={wins} />
        </strong>
        <i>—</i>
        <strong>
          <CountUp value={ties} />
        </strong>
        <i>—</i>
        <strong>
          <CountUp value={losses} />
        </strong>
      </div>
      <div className="record-labels">
        <span>VITTORIE</span>
        <span>PAREGGI</span>
        <span>SCONFITTE</span>
      </div>
      <div className="split">
        <i
          style={{
            width: `${(wins / gamesPlayed) * 100}%`,
          }}
        />
        <i
          style={{
            width: `${(ties / gamesPlayed) * 100}%`,
          }}
        />
        <i
          style={{
            width: `${(losses / gamesPlayed) * 100}%`,
          }}
        />
      </div>
      <p>{reading.record}</p>
    </div>
  );
}

function MetricsPanel({ club }) {
  const gamesPlayed = toNumber(club.gamesPlayed);
  return (
    <div className="metrics panel">
      <div>
        <span>GOL FATTI</span>
        <strong>
          <CountUp value={toNumber(club.goals)} />
        </strong>
        <small>
          {ratio(club.goals, gamesPlayed)}
          {' / gara'}
        </small>
      </div>
      <div>
        <span>GOL SUBITI</span>
        <strong>
          <CountUp value={toNumber(club.goalsAgainst)} />
        </strong>
        <small>
          {ratio(club.goalsAgainst, gamesPlayed)}
          {' / gara'}
        </small>
      </div>
      <div>
        <span>DIFFERENZA RETI</span>
        <strong className="lime">
          {toNumber(club.goals) - toNumber(club.goalsAgainst) > 0 ? '+' : ''}
          <CountUp value={toNumber(club.goals) - toNumber(club.goalsAgainst)} />
        </strong>
        <small>Gol fatti meno subiti</small>
      </div>
      <div>
        <span>PROMOZIONI</span>
        <strong>
          <CountUp value={toNumber(club.promotions)} />
        </strong>
        <small>
          {club.relegations}
          {' retrocessioni'}
        </small>
      </div>
    </div>
  );
}

function FormPanel({ club, clubId, matches }) {
  const gamesPlayed = toNumber(club.gamesPlayed);
  // V / P / S per ciascuna delle ultime gare.
  const form = matches.map((match) => {
    const own = match.clubs?.[clubId] || {};
    return toNumber(own.goals) > toNumber(own.goalsAgainst)
      ? 'V'
      : toNumber(own.goals) < toNumber(own.goalsAgainst)
        ? 'S'
        : 'P';
  });
  return (
    <div className="form panel">
      <span className="label">
        {'ULTIME '}
        {matches.length}
        {' · CAMPIONATO'}
      </span>
      <div className="form-row">
        {form.map((result, index) => (
          <span key={index} className={result}>
            {result}
          </span>
        ))}
      </div>
      <h3>
        {form.filter((result) => result === 'V').length}
        {' vittorie nelle ultime '}
        {matches.length}
      </h3>
      <p>
        {
          'EA espone le ultime cinque gare per modalità. Il record generale comprende '
        }
        {gamesPlayed}
        {' partite.'}
      </p>
      <a href="#partite">
        {'Apri le partite '}
        <ArrowUpRight size={16} />
      </a>
    </div>
  );
}

function QuickReading({ club, reading }) {
  const gamesPlayed = toNumber(club.gamesPlayed);
  return (
    <div className="insight">
      <div className="insight-symbol">◎</div>
      <div>
        <span>LETTURA RAPIDA</span>
        <strong>
          {ratio(club.goals, gamesPlayed)}
          {' gol fatti e '}
          {ratio(club.goalsAgainst, gamesPlayed)}
          {' subiti a gara.'}
        </strong>
        <p>{reading.quick}</p>
      </div>
      <b>
        {Math.round(
          (toNumber(club.goalsAgainst) / Math.max(1, toNumber(club.goals))) *
            100,
        )}
        %
      </b>
    </div>
  );
}

export function Overview({
  club,
  data,
  members,
  matches,
  refresh,
  refreshing,
}) {
  const { club: clubMeta } = useClub();
  const reading = clubReading(getEditorialContext(data, clubMeta.id).club);
  return (
    <section className="content" id="panoramica">
      <div className="section-head">
        <div>
          <span className="overline">01 / PANORAMICA</span>
          <h2>Il tabellone.</h2>
        </div>
        <button className="refresh" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          {' Aggiorna dati'}
        </button>
      </div>
      <div className="overview">
        <RecordPanel club={club} reading={reading} />
        <MetricsPanel club={club} />
        <FormPanel club={club} clubId={clubMeta.id} matches={matches} />
      </div>
      <QuickReading club={club} reading={reading} />
      <details className="compact-appendix">
        <summary>La lente sui numeri · andamento e leader</summary>
        <AnalysisRoom
          club={club}
          data={data}
          members={members}
          matches={matches}
        />
      </details>
    </section>
  );
}
