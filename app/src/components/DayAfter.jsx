import { useMemo, useState } from 'react';
import { assignQuotes, toQuotePlayer } from '../lib/adani-quotes.js';
import { groupByNight, summarizeNight } from '../lib/matches.js';
import {
  buildCover,
  buildRoleTrend,
  buildShareText,
  buildTrialTitle,
  buildTrials,
  buildTurningPoints,
} from '../lib/newsroom.js';
import { buildNightComments } from '../lib/coach.js';
import { missingByNight } from '../lib/missing.js';
import { getEditorialContext } from '../lib/editorial-ctx.js';
import { notebookEditorial, verdictFor } from '../../../shared/editorial.mjs';
import { buildSeasonProfile } from '../lib/season-profile.js';
import { CoverStory } from './day-after/CoverStory.jsx';
import { EditionBar } from './day-after/EditionBar.jsx';
import { Masthead } from './day-after/Masthead.jsx';
import { NightResults } from './day-after/NightResults.jsx';
import { Notebook } from './day-after/Notebook.jsx';
import { SeasonNovel } from './day-after/SeasonNovel.jsx';
import { Trials } from './day-after/Trials.jsx';
import { TurningPoints } from './day-after/TurningPoints.jsx';

/**
 * "Il giorno dopo": la gazzetta della serata scelta (copertina, svolte, processo
 * ai Pro, romanzo della stagione). `matches` è lo storico partite disponibile.
 */
export function DayAfter({ members, matches, data, health }) {
  const editorial = useMemo(() => getEditorialContext(data), [data]);
  const nights = useMemo(() => groupByNight(matches), [matches]);
  const [nightChoice, setNightChoice] = useState('');
  const [protagonistChoice, setProtagonistChoice] = useState('');
  const [copyState, setCopyState] = useState('');
  const selectedNight =
    nights.find((night) => night.day === nightChoice) || nights[0];
  const nightComments = useMemo(
    () => buildNightComments(data, selectedNight?.games || [], editorial.all),
    [data, editorial, selectedNight],
  );
  const nightStats = useMemo(
    () => summarizeNight(selectedNight?.games || []),
    [selectedNight],
  );
  const trials = buildTrials(nightStats.players, selectedNight?.day || '').map(
    ({ player, trial }) => {
      const verdict = nightComments.get(player.name.toLowerCase());
      return verdict
        ? {
            player,
            trial: {
              ...trial,
              title: buildTrialTitle(
                verdict,
                editorial.metricsByName.get(player.name.toLowerCase()),
              ),
              praise: verdict.praise,
              charge: verdict.charge,
              proof: verdict.proof.join(' · '),
              verdict: verdictFor(
                verdict.nightMetrics ||
                  editorial.metricsByName.get(player.name.toLowerCase()),
                verdict,
              ),
              coachNote: verdict.coachNote,
            },
          }
        : { player, trial };
    },
  );
  const cover = buildCover(
    nightStats,
    selectedNight?.games.length || 0,
    selectedNight?.day,
    editorial,
  );
  const turningPoints = buildTurningPoints(selectedNight?.games || [], editorial);
  const notebookText = notebookEditorial({
    players: nightStats.players,
    metricsByName: editorial.metricsByName,
    record: {
      games: selectedNight?.games.length || 0,
      against: nightStats.against,
    },
  });
  const coverPlayer =
    nightStats.winners[0] ||
    nightStats.players.find((player) => player.name === cover.name);
  const nightQuotes = assignQuotes(
    nightStats.players,
    selectedNight?.day || '',
  );
  const seasonQuotes = assignQuotes(members.map(toQuotePlayer), 'stagione');
  const protagonist =
    members.find((member) => member.name === protagonistChoice) ||
    members.find(
      (member) => member.name.toLowerCase() === coverPlayer?.name.toLowerCase(),
    ) ||
    members[0];
  const roleTrend = protagonist
    ? buildRoleTrend(protagonist.name, matches)
    : null;
  const seasonProfile = protagonist
    ? buildSeasonProfile(
        protagonist,
        members,
        {
          games: 0,
          label: '',
          rating: 0,
          goals: 0,
          assists: 0,
          passPct: 0,
          passAttempts: 0,
          tackles: 0,
        },
        {
          metrics: editorial.metricsByName.get(protagonist.name.toLowerCase()),
          club: editorial.club,
        },
      )
    : null;
  const shareText = buildShareText({
    night: selectedNight,
    nightStats,
    cover,
    trials,
  });
  async function copyEdition() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyState('ok');
    } catch {
      setCopyState('manual');
    }
  }
  return (
    <section className="day-after" id="giorno-dopo">
      <EditionBar
        nights={nights}
        selectedNight={selectedNight}
        setCopyState={setCopyState}
        setNightChoice={setNightChoice}
      />
      <Masthead />
      <div className="paper-nav">
        <a href="#processo">Il processo del pallone</a>
        <a href="#svolte">Le svolte della notte</a>
        <a href="#romanzo">Il romanzo dei Pro</a>
        <a href="#voti">I voti</a>
      </div>
      {selectedNight ? (
        <>
          <CoverStory
            cover={cover}
            nightStats={nightStats}
            selectedNight={selectedNight}
          />
          <NightResults
            nightStats={nightStats}
            selectedNight={selectedNight}
            missing={missingByNight(health, data).get(selectedNight?.day) || 0}
          />
          <TurningPoints turningPoints={turningPoints} />
          <Trials
            nightQuotes={nightQuotes}
            nightStats={nightStats}
            trials={trials}
          />
          <Notebook
            copyEdition={copyEdition}
            copyState={copyState}
            text={notebookText}
          />
          {copyState === 'manual' && (
            <label className="paper-manual-copy">
              Seleziona e copia il testo
              <textarea
                readOnly
                value={shareText}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
        </>
      ) : (
        <div className="paper-empty">
          <h2>La prossima storia aspetta il fischio d’inizio.</h2>
          <p>
            Le prime gare registrate apriranno copertina, pagelle e tabellini. I
            profili stagionali sono già qui sotto.
          </p>
        </div>
      )}
      {protagonist && seasonProfile && (
        <SeasonNovel
          members={members}
          protagonist={protagonist}
          roleTrend={roleTrend}
          seasonProfile={seasonProfile}
          seasonQuotes={seasonQuotes}
          setProtagonistChoice={setProtagonistChoice}
        />
      )}
      <details className="paper-method">
        <summary>Il taccuino della redazione</summary>
        <p>
          Ogni edizione usa le partite conservate della serata selezionata; le
          sessioni dopo mezzanotte e prima delle 06:00 italiane appartengono
          alla sera precedente. Giudizi e note sono commenti originali del
          club, scritti sui dati EA. Il migliore della serata segue la media EA
          più alta con almeno metà delle gare e voti in tutte le proprie
          presenze; senza candidati, considera chi ha più presenze e voti
          completi. Le medie identiche condividono il riconoscimento. I voti
          non sono corretti per ruolo o minuti. Il romanzo usa i
          totali stagionali EA; il grafico recente confronta soltanto lo stesso
          reparto, sull’archivio disponibile. I tiri senza gol non identificano
          da soli errori di mira o occasioni mancate. Le svolte descrivono
          risultati finali e sequenze di gare, senza inventare azioni o
          rimontare punteggi durante una partita.
        </p>
      </details>
    </section>
  );
}
