import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CLUB_ID } from '../lib/constants.js';
import { getEditorialContext } from '../lib/editorial-ctx.js';
import { getClubPlayers, getOpponentName } from '../lib/matches.js';
import {
  averageRating,
  summarizePlayers,
  toNumber,
  topPerformer,
} from '../lib/stats.js';
import { CurvePanel } from './match-lab/CurvePanel.jsx';
import { DuelPanel } from './match-lab/DuelPanel.jsx';
import { LabTabs } from './match-lab/LabTabs.jsx';
import { StudioPanel } from './match-lab/StudioPanel.jsx';

/** "Lo spogliatoio": match studio, curva di forma e testa a testa sulle ultime gare. */
export function MatchLab({ data, matches }) {
  const { metricsByName } = getEditorialContext(data);
  const sortedMatches = [...matches].sort(
    (a, b) => toNumber(b.timestamp) - toNumber(a.timestamp),
  );
  const [tab, setTab] = useState('studio');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [sortKey, setSortKey] = useState('rating');
  const [formPlayerChoice, setFormPlayerChoice] = useState('');
  const [formRoleChoice, setFormRoleChoice] = useState('');
  const [duelChoiceA, setDuelChoiceA] = useState('');
  const [duelChoiceB, setDuelChoiceB] = useState('');
  const [duelRole, setDuelRole] = useState('midfielder');
  const [copyStatus, setCopyStatus] = useState('');
  if (!sortedMatches.length)
    return (
      <section className="content match-lab" id="spogliatoio">
        <h2>Lo spogliatoio.</h2>
        <p>Le pagelle si accendono quando EA rende disponibili le partite.</p>
      </section>
    );
  const selectedMatch =
    sortedMatches.find(
      (sortedMatch) => sortedMatch.matchId === selectedMatchId,
    ) || sortedMatches[0];
  const matchPlayers = getClubPlayers(selectedMatch);
  const ownClub = selectedMatch.clubs[CLUB_ID];
  const allAppearances = sortedMatches.flatMap(getClubPlayers);
  const playerNames = [
    ...new Set(allAppearances.map((appearance) => appearance.playername)),
  ].sort((a, b) => a.localeCompare(b));
  const formPlayer = playerNames.includes(formPlayerChoice)
    ? formPlayerChoice
    : playerNames[0];
  const formRoles = [
    ...new Set(
      allAppearances
        .filter((appearance) => appearance.playername === formPlayer)
        .map((appearance) => appearance.pos),
    ),
  ];
  const formRole = formRoles.includes(formRoleChoice)
    ? formRoleChoice
    : formRoles[0];
  const formGames = [...sortedMatches].reverse().map((sortedMatch) => ({
    match: sortedMatch,
    entry: getClubPlayers(sortedMatch).find(
      (player) => player.playername === formPlayer && player.pos === formRole,
    ),
  }));
  const formEntries = formGames.flatMap((game) =>
    game.entry ? [game.entry] : [],
  );
  const formSummary = summarizePlayers(formEntries);
  const latestEntry = formEntries.at(-1);
  const previousEntries = formEntries.slice(0, -1);
  const previousAverage = averageRating(previousEntries);
  const ratingDelta =
    latestEntry && previousAverage !== null
      ? toNumber(latestEntry.rating) - previousAverage
      : null;
  const topRated = [...matchPlayers].sort(
    (a, b) =>
      toNumber(b.rating) - toNumber(a.rating) ||
      toNumber(b.goals) +
        toNumber(b.assists) -
        toNumber(a.goals) -
        toNumber(a.assists),
  )[0];
  const mvp = matchPlayers.find((player) => toNumber(player.mom) > 0);
  const topScorer = topPerformer(matchPlayers, 'goals');
  const topAssister = topPerformer(matchPlayers, 'assists');
  const topTackler = topPerformer(matchPlayers, 'tacklesmade');
  const bestPasser = [...matchPlayers]
    .filter((player) => toNumber(player.passattempts) >= 10)
    .sort(
      (a, b) =>
        toNumber(b.passesmade) / toNumber(b.passattempts) -
          toNumber(a.passesmade) / toNumber(a.passattempts) ||
        toNumber(b.rating) - toNumber(a.rating),
    )[0];
  const matchSummary = summarizePlayers(matchPlayers);
  const outcome =
    toNumber(ownClub.goals) > toNumber(ownClub.goalsAgainst)
      ? 'VITTORIA'
      : toNumber(ownClub.goals) < toNumber(ownClub.goalsAgainst)
        ? 'SCONFITTA'
        : 'PAREGGIO';
  const sortedPlayers = [...matchPlayers].sort((a, b) =>
    sortKey === 'passes'
      ? (toNumber(b.passattempts)
          ? toNumber(b.passesmade) / toNumber(b.passattempts)
          : -1) -
        (toNumber(a.passattempts)
          ? toNumber(a.passesmade) / toNumber(a.passattempts)
          : -1)
      : toNumber(b[sortKey]) - toNumber(a[sortKey]),
  );
  const duelCandidates = playerNames.filter((playerName) =>
    allAppearances.some(
      (appearance) =>
        appearance.playername === playerName && appearance.pos === duelRole,
    ),
  );
  const duelPlayerA = duelCandidates.includes(duelChoiceA)
    ? duelChoiceA
    : duelCandidates[0];
  const duelPlayerB =
    duelCandidates.includes(duelChoiceB) && duelChoiceB !== duelPlayerA
      ? duelChoiceB
      : duelCandidates.find((duelCandidate) => duelCandidate !== duelPlayerA);
  const duelSummaryA = summarizePlayers(
    allAppearances.filter(
      (appearance) =>
        appearance.playername === duelPlayerA && appearance.pos === duelRole,
    ),
  );
  const duelSummaryB = summarizePlayers(
    allAppearances.filter(
      (appearance) =>
        appearance.playername === duelPlayerB && appearance.pos === duelRole,
    ),
  );
  const dateLabel = new Date(
    toNumber(selectedMatch.timestamp) * 1e3,
  ).toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  async function copySummary() {
    const text = `BILLOCCHI CLUB ${ownClub.goals}–${ownClub.goalsAgainst} ${getOpponentName(selectedMatch)} · ${dateLabel}\n${outcome}\nMiglior voto Pro: ${topRated?.playername || '—'} (${topRated?.rating || '—'})${mvp ? `\nMVP EA: ${mvp.playername}` : ''}\n${topScorer ? `Più gol: ${topScorer.playername}, ${topScorer.goals}\n` : ''}${topAssister ? `Più assist: ${topAssister.playername}, ${topAssister.assists}\n` : ''}Passaggi dei Pro: ${matchSummary.passes}/${matchSummary.attempts}.\nhttps://billocchi-club.kr3n.chatgpt.site/#spogliatoio`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copiato: pronto per la chat del club.');
    } catch {
      setCopyStatus('Copia manualmente il riepilogo qui sotto.');
    }
  }
  return (
    <section className="content match-lab" id="spogliatoio">
      <div className="section-head">
        <div>
          <span className="overline">EXTRA TIME / LO SPOGLIATOIO</span>
          <h2>La partita dopo la partita.</h2>
          <p className="sub">
            Chi ha reso, dove c’è margine per migliorare, come si è giocato il pallone.
            Numeri EA, letti con onestà.
          </p>
        </div>
        <span className="lab-live">
          <Sparkles size={17} /> {sortedMatches.length}
          {' GARE DA ESPLORARE'}
        </span>
      </div>
      <LabTabs setTab={setTab} tab={tab} />
      {tab === 'studio' && (
        <StudioPanel
          bestPasser={bestPasser}
          copyStatus={copyStatus}
          copySummary={copySummary}
          dateLabel={dateLabel}
          mvp={mvp}
          matchPlayers={matchPlayers}
          metricsByName={metricsByName}
          outcome={outcome}
          ownClub={ownClub}
          selectedMatch={selectedMatch}
          setCopyStatus={setCopyStatus}
          setSelectedMatchId={setSelectedMatchId}
          setSortKey={setSortKey}
          sortKey={sortKey}
          sortedMatches={sortedMatches}
          sortedPlayers={sortedPlayers}
          topAssister={topAssister}
          topRated={topRated}
          topTackler={topTackler}
        />
      )}
      {tab === 'forma' && (
        <CurvePanel
          formGames={formGames}
          formPlayer={formPlayer}
          formRole={formRole}
          formRoles={formRoles}
          formSummary={formSummary}
          playerNames={playerNames}
          previousEntries={previousEntries}
          ratingDelta={ratingDelta}
          setFormPlayerChoice={setFormPlayerChoice}
          setFormRoleChoice={setFormRoleChoice}
          sortedMatches={sortedMatches}
        />
      )}
      {tab === 'duello' && (
        <DuelPanel
          duelCandidates={duelCandidates}
          duelPlayerA={duelPlayerA}
          duelPlayerB={duelPlayerB}
          duelRole={duelRole}
          duelSummaryA={duelSummaryA}
          duelSummaryB={duelSummaryB}
          setDuelChoiceA={setDuelChoiceA}
          setDuelChoiceB={setDuelChoiceB}
          setDuelRole={setDuelRole}
          sortedMatches={sortedMatches}
        />
      )}
    </section>
  );
}
