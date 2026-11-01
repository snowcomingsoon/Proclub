import { Check, Copy, Crosshair, Flame, Sparkles, Trophy } from 'lucide-react';
import {
  awardEditorial,
  matchStudioEditorial,
} from '../../../../shared/editorial.mjs';
import { formatNumber } from '../../lib/format.js';
import { getOpponentName } from '../../lib/matches.js';
import { POSITION_NAMES } from '../../lib/positions.js';
import { percentage, toNumber } from '../../lib/stats.js';
import { useClub } from '../../lib/useClub.js';

function LabAward({ label, player, detail, icon }) {
  return (
    <article className="lab-award">
      {icon}
      <span>{label}</span>
      <strong>{player?.playername || 'Non assegnato'}</strong>
      <p>
        {player
          ? detail
          : 'Nessuna prestazione soddisfa il criterio in questa gara.'}
      </p>
    </article>
  );
}

function Scoreboard({ club, dateLabel, outcome, ownClub, selectedMatch }) {
  return (
    <div className="lab-scoreboard">
      <div>
        <span className={`lab-outcome ${outcome}`}>{outcome}</span>
        <p>
          {dateLabel}
          {toNumber(ownClub.winnerByDnf) > 0
            ? ' · Vittoria per abbandono avversario'
            : ''}
        </p>
        <h3>
          {`${club.name} `}
          <span>
            {'vs '}
            {getOpponentName(selectedMatch, club.id)}
          </span>
        </h3>
      </div>
      <strong>
        {ownClub.goals}
        <i>:</i>
        {ownClub.goalsAgainst}
      </strong>
    </div>
  );
}

function Verdict({ matchPlayers, metricsByName, ownClub }) {
  const studio = matchStudioEditorial({
    own: ownClub,
    players: matchPlayers,
    metricsByName,
  });
  return (
    <div className="lab-story">
      <span>IL VERDETTO DELLO SPOGLIATOIO</span>
      <h3>{studio.headline}</h3>
      <p>{studio.text}</p>
    </div>
  );
}

function LabAwards({
  bestPasser,
  metricsByName,
  mvp,
  topAssister,
  topRated,
  topTackler,
}) {
  return (
    <div className="lab-awards">
      <LabAward
        label={mvp ? 'MVP UFFICIALE EA' : 'MIGLIOR VOTO PRO'}
        player={mvp || topRated}
        detail={
          (mvp || topRated) && awardEditorial('rated', mvp || topRated, metricsByName)
        }
        icon={<Trophy />}
      />
      <LabAward
        label="PIÙ ASSIST"
        player={topAssister}
        detail={topAssister && awardEditorial('assist', topAssister, metricsByName)}
        icon={<Sparkles />}
      />
      <LabAward
        label="PIÙ CONTRASTI"
        player={topTackler}
        detail={topTackler && awardEditorial('tackle', topTackler, metricsByName)}
        icon={<Crosshair />}
      />
      <LabAward
        label="PASSAGGI PIÙ PULITI"
        player={bestPasser}
        detail={bestPasser && awardEditorial('pass', bestPasser, metricsByName)}
        icon={<Flame />}
      />
    </div>
  );
}

function PlayersTable({ selectedMatch, sortedPlayers }) {
  return (
    <div className="lab-table-scroll">
      <table className="lab-table">
        <caption>
          {'Prestazioni dei Pro contro '}
          {getOpponentName(selectedMatch)}. PAS indica riusciti/tentati; CTR
          contrasti riusciti/tentati.
        </caption>
        <thead>
          <tr>
            <th>PRO / REPARTO</th>
            <th>VOTO EA</th>
            <th>GOL</th>
            <th>AST</th>
            <th>TIRI</th>
            <th>PAS</th>
            <th>CTR</th>
            <th>PARATE</th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayers.map((sortedPlayer) => (
            <tr key={sortedPlayer.playername}>
              <th scope="row">
                {sortedPlayer.playername}
                <small>
                  {POSITION_NAMES[sortedPlayer.pos] || sortedPlayer.pos}
                </small>
              </th>
              <td className="lab-rating">{sortedPlayer.rating}</td>
              <td>{sortedPlayer.goals}</td>
              <td>{sortedPlayer.assists}</td>
              <td>{sortedPlayer.shots}</td>
              <td>
                {sortedPlayer.passesmade}/{sortedPlayer.passattempts}
                <small>
                  {formatNumber(
                    percentage(
                      toNumber(sortedPlayer.passesmade),
                      toNumber(sortedPlayer.passattempts),
                    ),
                  )}
                  {toNumber(sortedPlayer.passattempts) ? '%' : ''}
                </small>
              </td>
              <td>
                {sortedPlayer.tacklesmade}/{sortedPlayer.tackleattempts}
              </td>
              <td>{sortedPlayer.saves}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudioPanel({
  bestPasser,
  copyStatus,
  copySummary,
  dateLabel,
  mvp,
  matchPlayers,
  metricsByName,
  outcome,
  ownClub,
  selectedMatch,
  setCopyStatus,
  setSelectedMatchId,
  setSortKey,
  sortKey,
  sortedMatches,
  sortedPlayers,
  topAssister,
  topRated,
  topTackler,
}) {
  const { club } = useClub();
  const shareHref =
    club.key === 'faida'
      ? `${club.shareUrl}#spogliatoio`
      : 'https://billocchi-club.kr3n.chatgpt.site/#spogliatoio';
  return (
    <div
      className="lab-panel"
      id="panel-studio"
      role="tabpanel"
      aria-labelledby="tab-studio"
    >
      <div className="lab-toolbar">
        <label>
          Seleziona la gara
          <select
            value={selectedMatch.matchId}
            onChange={(event) => {
              setSelectedMatchId(event.target.value);
              setCopyStatus('');
            }}
          >
            {sortedMatches.map((sortedMatch) => (
              <option key={sortedMatch.matchId} value={sortedMatch.matchId}>
                {new Date(
                  toNumber(sortedMatch.timestamp) * 1e3,
                ).toLocaleDateString('it-IT', {
                  day: 'numeric',
                  month: 'short',
                })}
                {' · '}
                {sortedMatch.clubs?.[club.id]?.goals ?? 0}–
                {sortedMatch.clubs?.[club.id]?.goalsAgainst ?? 0}
                {' vs '}
                {getOpponentName(sortedMatch, club.id)}
              </option>
            ))}
          </select>
        </label>
        <button className="lab-copy" onClick={copySummary}>
          {copyStatus.startsWith('Copiato') ? (
            <Check size={17} />
          ) : (
            <Copy size={17} />
          )}
          {' Copia per la chat'}
        </button>
      </div>
      <p className="lab-copy-status" role="status">
        {copyStatus}
      </p>
      {copyStatus.startsWith('Copia manualmente') && (
        <textarea
          aria-label="Riepilogo da copiare"
          readOnly
          value={`${club.name} ${ownClub.goals}–${ownClub.goalsAgainst} ${getOpponentName(selectedMatch, club.id)} · ${dateLabel}\nMiglior voto: ${topRated?.playername} (${topRated?.rating})\n${shareHref}`}
        />
      )}
      <Scoreboard
        club={club}
        dateLabel={dateLabel}
        outcome={outcome}
        ownClub={ownClub}
        selectedMatch={selectedMatch}
      />
      <Verdict
        matchPlayers={matchPlayers}
        metricsByName={metricsByName}
        ownClub={ownClub}
      />
      <LabAwards
        bestPasser={bestPasser}
        metricsByName={metricsByName}
        mvp={mvp}
        topAssister={topAssister}
        topRated={topRated}
        topTackler={topTackler}
      />
      <div className="lab-table-head">
        <h3>La pagella completa.</h3>
        <label>
          Ordina per
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
          >
            <option value="rating">Voto EA</option>
            <option value="goals">Gol</option>
            <option value="assists">Assist</option>
            <option value="passes">Passaggi %</option>
            <option value="tacklesmade">Contrasti</option>
          </select>
        </label>
      </div>
      <PlayersTable
        selectedMatch={selectedMatch}
        sortedPlayers={sortedPlayers}
      />
      <p className="lab-note">
        I riconoscimenti sono assegnati automaticamente dai dati della gara; in
        parità decide il voto EA. I passaggi e i tiri riguardano solo i Pro registrati,
        non l’intera squadra. Conversione = gol/tiri, non precisione nello
        specchio. Nessuna cronaca minuto per minuto è disponibile.
      </p>
    </div>
  );
}
