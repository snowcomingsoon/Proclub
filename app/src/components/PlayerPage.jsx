import { useMemo } from 'react';
import { analyzeClub, appearancesFor, buildAll } from '../../../shared/metrics.mjs';
import { commentFor } from '../../../shared/commentary.mjs';
import { computeCardProfile } from '../lib/card-profile.js';
import { formatProOverall } from '../lib/format.js';
import { STATS_HREF } from '../lib/route.js';
import { toNumber } from '../lib/stats.js';
import { CollectorCard } from './CollectorCard.jsx';
import { FormChart } from './pages/FormChart.jsx';

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const f1 = (value) => value.toFixed(1);
const f2 = (value) => value.toFixed(2);

const dayKey = (timestamp) =>
  new Date(timestamp * 1000).toLocaleDateString('en-CA', {
    timeZone: 'Europe/Rome',
  });

const formatNight = (timestamp) =>
  new Date(timestamp * 1000).toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

const uniqueByArea = (items, limit) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.area)) continue;
    seen.add(item.area);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
};

/** Numeri chiave per gara con la mediana dei pari ruolo del club (stessa famiglia di ruolo, almeno 5 presenze). */
function buildKeyNumbers(metrics, member, all) {
  const games = metrics.games;
  const tacklesPerGame = games ? toNumber(member.tacklesMade) / games : null;
  const peers = all.filter(
    (other) =>
      other.family === metrics.family && other.games >= 5 && other.rating,
  );
  // Pro polivalente: totali stagionali di ruoli diversi, nessun confronto con i pari ruolo
  const hasPeers =
    !metrics.mixed &&
    peers.length >= 3 &&
    peers.some((other) => other.name === metrics.name);
  const tacklesOf = (other) =>
    other.games ? other.tacklesPerGameValue : null;
  const peerValues = (read) =>
    peers.map(read).filter((value) => value != null && Number.isFinite(value));
  const cards = [
    {
      key: 'goals',
      label: 'Gol a gara',
      value: metrics.goalsPerGame,
      detail: `${metrics.goals} in ${games} presenze`,
      read: (o) => o.goalsPerGame,
      better: 'high',
      digits: 2,
    },
    {
      key: 'assists',
      label: 'Assist a gara',
      value: metrics.assistsPerGame,
      detail: `${metrics.assists} in ${games} presenze`,
      read: (o) => o.assistsPerGame,
      better: 'high',
      digits: 2,
    },
    {
      key: 'failed',
      label: 'Passaggi falliti a gara',
      value: metrics.passFailedPerGame,
      detail:
        metrics.passPct != null ? `${Math.round(metrics.passPct)}% riusciti` : '',
      read: (o) => o.passFailedPerGame,
      better: 'low',
      digits: 1,
    },
    {
      key: 'tackles',
      label: 'Contrasti a gara',
      value: tacklesPerGame,
      detail: `${toNumber(member.tacklesMade)} riusciti in stagione`,
      read: tacklesOf,
      better: 'high',
      digits: 1,
    },
    {
      key: 'shots',
      label: 'Tiri a gara',
      value: metrics.shotsPerGame ?? null,
      detail: metrics.offSample
        ? `nelle ultime ${metrics.offSample} gare${metrics.mixed && metrics.roleScope ? ` ${metrics.roleScope}` : ''}`
        : '',
      read: (o) => o.shotsPerGame,
      better: 'high',
      digits: 1,
    },
    {
      key: 'mvp',
      label: 'MVP',
      value: metrics.motm,
      detail:
        metrics.motmRate != null
          ? `${Math.round(metrics.motmRate)}% delle gare`
          : '',
      read: (o) => o.motmRate,
      compareValue: metrics.motmRate,
      better: 'high',
      digits: 0,
    },
  ];
  return cards
    .filter((card) => card.value != null && Number.isFinite(card.value))
    .map((card) => {
      const reference = hasPeers ? median(peerValues(card.read)) : null;
      const own = card.compareValue ?? card.value;
      let verdict = null;
      if (reference != null && own != null) {
        const diff = own - reference;
        const tolerance = Math.max(0.05, Math.abs(reference) * 0.1);
        verdict =
          Math.abs(diff) <= tolerance
            ? 'flat'
            : (diff > 0) === (card.better === 'high')
              ? 'good'
              : 'bad';
      }
      return { ...card, reference, own, verdict };
    });
}

function KeyNumber({ card }) {
  const scale = Math.max(card.own ?? 0, card.reference ?? 0, 0.0001) * 1.2;
  const fmt = (value) =>
    card.key === 'mvp' ? `${Math.round(value)}%` : value.toFixed(card.digits);
  const referenceText =
    card.reference != null
      ? card.key === 'mvp'
        ? `${Math.round(card.reference)}%`
        : card.reference.toFixed(card.digits === 0 ? 1 : card.digits)
      : null;
  const word =
    card.verdict === 'flat'
      ? 'in linea con'
      : card.better === 'high'
        ? card.verdict === 'good'
          ? 'sopra'
          : 'sotto'
        : card.verdict === 'good'
          ? 'sotto'
          : 'sopra';
  return (
    <li className={`pg-key ${card.verdict ? `is-${card.verdict}` : ''}`}>
      <span className="pg-key-label">{card.label}</span>
      <b>{card.digits === 0 ? card.value : card.value.toFixed(card.digits)}</b>
      {card.detail && <small>{card.detail}</small>}
      {card.reference != null && (
        <>
          <div className="pg-key-track" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (card.own / scale) * 100)}%` }} />
            <em style={{ left: `${Math.min(100, (card.reference / scale) * 100)}%` }} />
          </div>
          <small className="pg-key-ref">
            {`Pari ruolo: mediana ${referenceText}, ${word === 'in linea con' ? 'in linea' : word + ' la mediana'}`}
          </small>
        </>
      )}
    </li>
  );
}

function Nights({ appearances }) {
  const nights = useMemo(() => {
    const byDay = new Map();
    for (const game of appearances) {
      const key = dayKey(game.timestamp);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(game);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 4)
      .map(([key, games]) => {
        const rated = games.filter((game) => game.rating > 0);
        return {
          key,
          timestamp: games[0].timestamp,
          games: [...games].sort((a, b) => a.timestamp - b.timestamp),
          w: games.filter((game) => game.result === 'V').length,
          d: games.filter((game) => game.result === 'P').length,
          l: games.filter((game) => game.result === 'S').length,
          goals: games.reduce((sum, game) => sum + game.goals, 0),
          assists: games.reduce((sum, game) => sum + game.assists, 0),
          mvp: games.filter((game) => game.mom).length,
          rating: rated.length
            ? rated.reduce((sum, game) => sum + game.rating, 0) / rated.length
            : null,
        };
      });
  }, [appearances]);
  if (!nights.length) return null;
  return (
    <section className="content pg-section" aria-labelledby="pl-nights">
      <div className="section-head">
        <div>
          <span className="overline">SERATE RECENTI</span>
          <h2 id="pl-nights">Le ultime uscite.</h2>
        </div>
      </div>
      <ul className="pg-nights">
        {nights.map((night) => (
          <li key={night.key}>
            <div className="pg-night-head">
              <h3>{formatNight(night.timestamp)}</h3>
              <p>
                {night.games.length} {night.games.length === 1 ? 'gara' : 'gare'}
                {` · ${night.w}V ${night.d}P ${night.l}S`}
              </p>
            </div>
            <dl className="pg-night-stats">
              <div>
                <dt>Voto medio</dt>
                <dd>{night.rating != null ? f2(night.rating) : '—'}</dd>
              </div>
              <div>
                <dt>Gol</dt>
                <dd>{night.goals}</dd>
              </div>
              <div>
                <dt>Assist</dt>
                <dd>{night.assists}</dd>
              </div>
              <div>
                <dt>MVP</dt>
                <dd>{night.mvp}</dd>
              </div>
            </dl>
            <ul className="pg-night-games">
              {night.games.map((game) => (
                <li key={game.matchId} className={`pg-res-${game.result}`}>
                  <span className="pg-night-score">
                    <b>{game.result}</b> {game.gf}–{game.ga}
                  </span>
                  <span className="pg-night-opp">
                    {game.opponent ? `vs ${game.opponent}` : 'avversario n.d.'}
                  </span>
                  <span className="pg-night-vote">
                    {game.rating > 0 ? f1(game.rating) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Vista `#/pro/<nome>`: pagina del giocatore costruita sul motore di analisi condiviso. */
export function PlayerPage({ data, name }) {
  const analysis = useMemo(() => {
    const all = buildAll(data).map((metrics) => {
      const member = data.members.members.find((m) => m.name === metrics.name);
      return {
        ...metrics,
        tacklesPerGameValue: metrics.games
          ? toNumber(member?.tacklesMade) / metrics.games
          : null,
      };
    });
    return { all, club: analyzeClub(data, undefined, all) };
  }, [data]);
  const metrics = analysis.all.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
  const member = data.members.members.find((m) => m.name === metrics?.name);
  const appearances = useMemo(
    () => (metrics ? appearancesFor(data.matchHistory || [], metrics.name) : []),
    [data, metrics],
  );
  if (!metrics || !member) return null;

  const comment = commentFor(metrics);
  const profile = computeCardProfile(member, data.matches || []);
  const games = metrics.games;
  const enough = comment.tier !== 'campione_insufficiente';
  const rated = appearances.filter((game) => game.rating > 0);
  const keyNumbers = games ? buildKeyNumbers(metrics, member, analysis.all) : [];
  const strengths = metrics.rating > 8 ? uniqueByArea(comment.positives, 3) : [];
  let weaknesses = uniqueByArea(comment.negatives, 4).map((item) => item.text);
  if (!weaknesses.length && enough && comment.charge) weaknesses = [comment.charge];
  const pairs = analysis.club.pairs
    .filter((pair) => pair.delta != null && (pair.a === metrics.name || pair.b === metrics.name))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  const hasOnOff = metrics.nOff > 0 && metrics.pointsPerGameOff != null;
  const roleName = metrics.mixed
    ? 'Polivalente'
    : metrics.roleLabel
      ? metrics.roleLabel.charAt(0).toUpperCase() + metrics.roleLabel.slice(1)
      : '';
  const roleMixText = (metrics.roleMix || [])
    .map((item) => `${item.n} da ${item.label}`)
    .join(', ');

  return (
    <div className="pg pg-player">
      <div className="pg-top pg-hero">
        <div className="pg-hero-card">
          <CollectorCard member={member} profile={profile} />
        </div>
        <div className="pg-hero-copy">
          <span className="overline">
            PRO / {games ? roleName.toUpperCase() : 'SENZA PRESENZE'}
          </span>
          <h1>{member.name}</h1>
          <dl className="pg-facts">
            <div>
              <dt>Overall EA</dt>
              <dd>{formatProOverall(member)}</dd>
            </div>
            {games > 0 && (
              <div>
                <dt>Ruolo giocato</dt>
                <dd>
                  {metrics.mixed
                    ? `Ultime ${metrics.roleMix.reduce((sum, item) => sum + item.n, 0)} gare: ${roleMixText}`
                    : roleName}
                  {metrics.proPosLabel ? ` · ${metrics.proPosLabel}` : ''}
                </dd>
              </div>
            )}
            <div>
              <dt>Presenze</dt>
              <dd>{games}</dd>
            </div>
            {games > 0 && metrics.rating > 0 && (
              <div>
                <dt>Media EA</dt>
                <dd>{f2(metrics.rating)}</dd>
              </div>
            )}
            {games > 0 && (
              <div>
                <dt>Gol · Assist</dt>
                <dd>
                  {metrics.goals} · {metrics.assists}
                </dd>
              </div>
            )}
          </dl>
          <nav className="pg-links" aria-label="Altre pagine">
            <a className="pg-link" href="#rosa">
              ← La rosa
            </a>
            <a className="pg-link" href={STATS_HREF}>
              Statistiche
            </a>
          </nav>
        </div>
      </div>

      {!enough && (
        <section className="content pg-section pg-empty" aria-label="Campione">
          <p>{comment.charge}</p>
        </section>
      )}

      {rated.length >= 2 && (
        <section className="content pg-section" aria-labelledby="pl-form">
          <div className="section-head">
            <div>
              <span className="overline">LA FORMA</span>
              <h2 id="pl-form">Voti gara per gara.</h2>
              <p className="sub">
                {`Voti EA nelle ${rated.length} gare con dettaglio, contro la media di stagione.`}
              </p>
            </div>
          </div>
          <div className="panel pg-panel">
            <FormChart
              games={rated}
              seasonAverage={metrics.rating}
              name={metrics.name}
            />
            <details className="pg-fold">
              <summary>Tabella dei voti</summary>
              <div className="pg-table-scroll">
                <table className="pg-table">
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Avversario</th>
                      <th scope="col">Esito</th>
                      <th scope="col">Voto</th>
                      <th scope="col">G</th>
                      <th scope="col">A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rated].reverse().map((game) => (
                      <tr key={game.matchId}>
                        <td>
                          {new Date(game.timestamp * 1000).toLocaleDateString('it-IT', {
                            timeZone: 'Europe/Rome',
                            day: '2-digit',
                            month: 'short',
                          })}
                        </td>
                        <th scope="row">{game.opponent || '—'}</th>
                        <td>
                          {game.result} {game.gf}–{game.ga}
                        </td>
                        <td>
                          {f1(game.rating)}
                          {game.mom ? ' · MVP' : ''}
                        </td>
                        <td>{game.goals}</td>
                        <td>{game.assists}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
      )}

      {keyNumbers.length > 0 && (
        <section className="content pg-section" aria-labelledby="pl-numbers">
          <div className="section-head">
            <div>
              <span className="overline">I NUMERI</span>
              <h2 id="pl-numbers">Per gara.</h2>
            </div>
          </div>
          <ul className="pg-keys">
            {keyNumbers.map((card) => (
              <KeyNumber key={card.key} card={card} />
            ))}
          </ul>
        </section>
      )}

      {enough && (strengths.length > 0 || weaknesses.length > 0) && (
        <section className="content pg-section" aria-labelledby="pl-reading">
          <div className="section-head">
            <div>
              <span className="overline">LA LETTURA</span>
              <h2 id="pl-reading">
                {strengths.length ? 'Cosa funziona, cosa no.' : 'Dove si perde terreno.'}
              </h2>
              {metrics.mixed && metrics.roleScope && (
                <p className="sub">
                  {`Ruoli diversi nelle ultime gare: i giudizi di ruolo riguardano le gare ${metrics.roleScope}; le medie di stagione sono miste.`}
                </p>
              )}
            </div>
          </div>
          <div className={`pg-reading ${strengths.length ? 'is-double' : ''}`}>
            {strengths.length > 0 && (
              <div className="panel pg-panel pg-good">
                <h3>Punti di forza</h3>
                <ul>
                  {strengths.map((item) => (
                    <li key={item.area}>{item.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {weaknesses.length > 0 && (
              <div className="panel pg-panel pg-bad">
                <h3>Punti deboli</h3>
                <ul>
                  {weaknesses.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {comment.coachNote && (
            <aside className="pg-coach">
              <span className="overline">LA NOTA DELL’ALLENATORE</span>
              <p>{comment.coachNote}</p>
            </aside>
          )}
        </section>
      )}

      {(hasOnOff || pairs.length > 0) && (
        <section className="content pg-section" aria-labelledby="pl-club">
          <div className="section-head">
            <div>
              <span className="overline">IL CLUB</span>
              <h2 id="pl-club">Con e senza.</h2>
            </div>
          </div>
          <ul className="pg-onoff">
            {hasOnOff && (
              <li className="panel pg-panel">
                <h3>{metrics.name} in campo</h3>
                <p>
                  {`Con lui il club ha fatto ${f2(metrics.pointsPerGame)} punti a gara in ${metrics.nOn} gare e ha subito ${f2(metrics.concededPerGameOn)} gol a gara. Nelle ${metrics.nOff} gare senza di lui: ${f2(metrics.pointsPerGameOff)} punti e ${f2(metrics.concededPerGameOff)} gol subiti a gara.`}
                </p>
              </li>
            )}
            {pairs.map((pair) => {
              const mate = pair.a === metrics.name ? pair.b : pair.a;
              return (
                <li key={`${pair.a}-${pair.b}`} className="panel pg-panel">
                  <h3>
                    Insieme a <a href={`#/pro/${encodeURIComponent(mate)}`}>{mate}</a>
                  </h3>
                  <p>
                    {`${pair.n} gare insieme: ${f2(pair.ppg)} punti a gara e ${f2(pair.gaPerGame)} gol subiti, contro ${f2(pair.ppgRest)} punti e ${f2(pair.gaRest)} gol subiti nelle ${pair.nRest} senza la coppia.`}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Nights appearances={appearances} />
    </div>
  );
}
