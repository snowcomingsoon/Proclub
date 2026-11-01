import {
  Activity,
  Crosshair,
  ScanLine,
  Target,
  TrendingUp,
} from 'lucide-react';
import { signalsEditorial } from '../../../shared/editorial.mjs';
import { getEditorialContext } from '../lib/editorial-ctx.js';
import { getOpponentName } from '../lib/matches.js';
import { toNumber } from '../lib/stats.js';
import { useClub } from '../lib/useClub.js';
import { Reveal } from './Reveal.jsx';

/**
 * "Sala analisi": andamento delle ultime gare e leader del club.
 * `members` è la rosa già ordinata per gol + assist, `matches` le ultime gare EA.
 */
export function AnalysisRoom({ club, data, members, matches }) {
  const { club: clubMeta } = useClub();
  const activeMembers = members
    .filter((member) => toNumber(member.gamesPlayed) > 0)
    .sort(
      (a, b) =>
        toNumber(b.goals) +
        toNumber(b.assists) -
        toNumber(a.goals) -
        toNumber(a.assists),
    );
  const topScorer = [...activeMembers].sort(
    (a, b) => toNumber(b.goals) - toNumber(a.goals),
  )[0];
  const topAssister = [...activeMembers].sort(
    (a, b) => toNumber(b.assists) - toNumber(a.assists),
  )[0];
  const topPasser = [...activeMembers]
    .filter((activeMember) => toNumber(activeMember.gamesPlayed) >= 10)
    .sort(
      (a, b) => toNumber(b.passSuccessRate) - toNumber(a.passSuccessRate),
    )[0];
  const signals = signalsEditorial(getEditorialContext(data, clubMeta.id).club, {
    scorer: topScorer?.name,
    assister: topAssister?.name,
    passer: topPasser?.name,
  });
  // Dalla gara più vecchia alla più recente.
  const recentGames = matches
    .slice()
    .reverse()
    .map((match) => {
      const own = match.clubs?.[clubMeta.id] || {};
      return {
        id: match.matchId,
        for: toNumber(own.goals),
        against: toNumber(own.goalsAgainst),
        name: getOpponentName(match, clubMeta.id),
      };
    });
  const goalsFor = recentGames.reduce(
    (total, recentGame) => total + recentGame.for,
    0,
  );
  const goalsAgainst = recentGames.reduce(
    (total, recentGame) => total + recentGame.against,
    0,
  );
  const maxGoals = Math.max(
    5,
    ...recentGames.flatMap((recentGame) => [
      recentGame.for,
      recentGame.against,
    ]),
  );
  return (
    <section className="analysis" id="analisi">
      <Reveal>
        <div className="section-head">
          <div>
            <span className="overline">02 / LA SALA ANALISI</span>
            <h2>Dentro i numeri.</h2>
            <p className="sub">
              {
                'Dati aggiornati da EA. Gli insight sulle gare recenti si riferiscono soltanto alle ultime '
              }
              {recentGames.length}
              {' partite disponibili.'}
            </p>
          </div>
          <span className="analysis-stamp">
            <ScanLine size={17} />
            {' MATCH INTELLIGENCE'}
          </span>
        </div>
      </Reveal>
      <div className="analysis-grid">
        <Reveal className="analysis-card pulse-card">
          <div className="analysis-card-head">
            <span>
              {'IL PULSE DELLE ULTIME '}
              {recentGames.length}
            </span>
            <TrendingUp size={18} />
          </div>
          <div className="pulse-totals">
            <strong>
              {goalsFor}
              <small>{' FATTI'}</small>
            </strong>
            <span>:</span>
            <strong>
              {goalsAgainst}
              <small>{' SUBITI'}</small>
            </strong>
          </div>
          <div
            className="pulse-chart"
            aria-label="Gol fatti e subiti nelle ultime partite, in ordine cronologico"
          >
            {recentGames.map((game, index) => (
              <div key={game.id} className="pulse-game">
                <div className="pulse-bars">
                  <i
                    className="bar-for"
                    style={{
                      height: `${Math.max(7, (game.for / maxGoals) * 100)}%`,
                      animationDelay: `${index * 90}ms`,
                    }}
                    title={`${game.for} gol fatti`}
                  />
                  <i
                    className="bar-against"
                    style={{
                      height: `${Math.max(7, (game.against / maxGoals) * 100)}%`,
                      animationDelay: `${index * 90 + 80}ms`,
                    }}
                    title={`${game.against} gol subiti`}
                  />
                </div>
                <b>
                  {game.for}–{game.against}
                </b>
                <span title={game.name}>{game.name}</span>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span>
              <i />
              {' Gol fatti'}
            </span>
            <span>
              <i />
              {' Gol subiti'}
            </span>
            <small>DAL PIÙ VECCHIO AL PIÙ RECENTE →</small>
          </div>
        </Reveal>
      </div>
      <Reveal>
        <div className="signal-grid">
          <div className="signal">
            <span className="signal-icon">
              <Crosshair size={22} />
            </span>
            <div>
              <span>FINALIZZATORE</span>
              <strong>{topScorer?.name || '—'}</strong>
              <p>{signals.scorer}</p>
            </div>
          </div>
          <div className="signal">
            <span className="signal-icon">
              <Target size={22} />
            </span>
            <div>
              <span>UOMO ASSIST</span>
              <strong>{topAssister?.name || '—'}</strong>
              <p>{signals.assister}</p>
            </div>
          </div>
          <div className="signal">
            <span className="signal-icon">
              <Activity size={22} />
            </span>
            <div>
              <span>PIÙ PRECISO NEI PASSAGGI</span>
              <strong>{topPasser?.name || '—'}</strong>
              <p>{signals.passer}</p>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
