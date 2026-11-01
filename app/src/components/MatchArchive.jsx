import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { EA_CLUBS_URL } from '../lib/constants.js';
import { toNumber } from '../lib/stats.js';
import { useClub } from '../lib/useClub.js';

function MatchList({ matches, club }) {
  return (
    <div className="match-list">
      {matches.map((match, matchIndex) => {
        const own = match.clubs?.[club.id] || {};
        const opponent = Object.entries(match.clubs || {}).find(
          ([clubId]) => clubId !== club.id,
        )?.[1];
        const players = Object.values(match.players?.[club.id] || {});
        const outcome =
          toNumber(own.goals) > toNumber(own.goalsAgainst)
            ? 'VITTORIA'
            : toNumber(own.goals) < toNumber(own.goalsAgainst)
              ? 'SCONFITTA'
              : 'PAREGGIO';
        return (
          <details key={match.matchId} className="match">
            <summary>
              <span className="match-index">0{matchIndex + 1}</span>
              <span className={'outcome ' + outcome}>{outcome}</span>
              <strong>
                {`${club.name} `}
                <b>
                  {own.goals}
                  {' — '}
                  {opponent?.goals}
                </b>{' '}
                {opponent?.details?.name || 'Avversario'}
              </strong>
              <time>
                {new Date(toNumber(match.timestamp) * 1e3).toLocaleDateString(
                  'it-IT',
                  {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  },
                )}
              </time>
              <ChevronDown size={18} />
            </summary>
            <div className="match-detail">
              <div className="match-mini">
                <span>
                  <b>
                    {players.reduce(
                      (total, player) => total + toNumber(player.goals),
                      0,
                    )}
                  </b>
                  {' GOL DEI PRO'}
                </span>
                <span>
                  <b>
                    {players.reduce(
                      (total, player) => total + toNumber(player.assists),
                      0,
                    )}
                  </b>
                  {' ASSIST'}
                </span>
                <span>
                  <b>{players.length}</b>
                  {' PRO IN CAMPO'}
                </span>
              </div>
              <div className="match-players">
                {players.map((player, playerIndex) => (
                  <div key={playerIndex}>
                    <strong>{player.playername}</strong>
                    <span>{player.pos}</span>
                    <b>
                      {player.goals}
                      {' G · '}
                      {player.assists}
                      {' A'}
                    </b>
                    <em>{player.rating}</em>
                  </div>
                ))}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function MatchArchive({ matches }) {
  const { club } = useClub();
  return (
    <details className="compact-appendix match-archive">
      <summary>Archivio rapido · tabellini di campionato</summary>
      <section className="content matches" id="partite">
        <div className="section-head">
          <div>
            <span className="overline">04 / MATCH CENTER</span>
            <h2>Ultime dal campo.</h2>
            <p className="sub">
              Campionato, dalla più recente. Apri una gara per le prestazioni
              dei Pro.
            </p>
          </div>
          <a
            className="source"
            href={`${EA_CLUBS_URL}/match-history?clubId=${club.id}&platform=common-gen5`}
            target="_blank"
            rel="noreferrer"
          >
            {'Fonte EA '}
            <ArrowUpRight size={16} />
          </a>
        </div>
        <MatchList matches={matches} club={club} />
      </section>
    </details>
  );
}
