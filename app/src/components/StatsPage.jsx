import { useMemo, useState } from 'react';
import { playerHref } from '../lib/route.js';
import { toNumber } from '../lib/stats.js';
import { useArchive } from '../lib/useArchive.js';
import { useClub } from '../lib/useClub.js';
import { Tabs } from './pages/Tabs.jsx';

const COLUMNS = [
  { key: 'name', label: 'Pro', tab: 'Nome' },
  { key: 'games', label: 'Pres.', tab: 'Presenze' },
  { key: 'goals', label: 'Gol', tab: 'Gol' },
  { key: 'assists', label: 'Ast', tab: 'Assist' },
  { key: 'rating', label: 'Voto', tab: 'Voto' },
  { key: 'pass', label: 'Pass %', tab: 'Passaggi' },
  { key: 'tackles', label: 'Contrasti', tab: 'Contrasti' },
  { key: 'motm', label: 'MVP', tab: 'MVP' },
];

const H2H_STATS = [
  ['Presenze', 'games', 0],
  ['Gol', 'goals', 0],
  ['Assist', 'assists', 0],
  ['Voto medio', 'rating', 1],
  ['Passaggi %', 'pass', 0],
  ['Contrasti', 'tackles', 0],
  ['MVP', 'motm', 0],
];

const OUTCOME = {
  V: 'Vittoria',
  P: 'Pareggio',
  S: 'Sconfitta',
};

const outcomeOf = (row) =>
  row.goalsFor > row.goalsAgainst ? 'V' : row.goalsFor < row.goalsAgainst ? 'S' : 'P';

const formatWhen = (timestamp) =>
  new Date(timestamp * 1000).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatMonth = (month) => {
  const [year, number] = month.split('-').map(Number);
  const label = new Date(Date.UTC(year, number - 1, 15)).toLocaleDateString(
    'it-IT',
    { timeZone: 'UTC', month: 'long', year: 'numeric' },
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const cell = (value, digits = 0) =>
  digits ? Number(value).toFixed(digits) : String(value);

function toRow(member) {
  return {
    name: member.name,
    games: toNumber(member.gamesPlayed),
    goals: toNumber(member.goals),
    assists: toNumber(member.assists),
    rating: toNumber(member.ratingAve),
    pass: toNumber(member.passSuccessRate),
    tackles: toNumber(member.tacklesMade),
    motm: toNumber(member.manOfTheMatch),
  };
}

function ClubRecords({ club }) {
  const records = [
    ['Partite', club.gamesPlayed],
    ['Vittorie', club.wins],
    ['Pareggi', club.ties],
    ['Sconfitte', club.losses],
    ['Gol fatti', club.goals],
    ['Gol subiti', club.goalsAgainst],
    ['Serie utile', club.unbeatenstreak],
    ['Skill rating', club.skillRating],
  ];
  return (
    <dl className="pg-records">
      {records.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Leaderboard({ rows }) {
  const [sort, setSort] = useState({ key: 'goals', dir: -1 });
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const first =
          sort.key === 'name'
            ? a.name.localeCompare(b.name) * sort.dir
            : (a[sort.key] - b[sort.key]) * sort.dir;
        return first || a.name.localeCompare(b.name);
      }),
    [rows, sort],
  );
  const choose = (key) =>
    setSort({ key, dir: key === 'name' ? 1 : -1 });
  const toggle = (key) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: -current.dir }
        : { key, dir: key === 'name' ? 1 : -1 },
    );
  const activeLabel = COLUMNS.find((column) => column.key === sort.key).tab;
  return (
    <>
      <Tabs
        label="Ordina la classifica per"
        idPrefix="board"
        panelId="board-panel"
        tabs={COLUMNS.map((column) => ({ id: column.key, label: column.tab }))}
        value={sort.key}
        onChange={choose}
      />
      <div
        className="pg-table-scroll"
        id="board-panel"
        role="tabpanel"
        aria-labelledby={`tab-board-${sort.key}`}
        tabIndex={0}
      >
        <table className="pg-table">
          <caption className="sr-only">
            Classifica dei Pro ordinata per {activeLabel.toLowerCase()},{' '}
            {sort.dir < 0 ? 'dal più alto' : 'in ordine crescente'}
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort.key === column.key
                      ? sort.dir < 0
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                >
                  <button type="button" onClick={() => toggle(column.key)}>
                    {column.label}
                    <span aria-hidden="true">
                      {sort.key === column.key
                        ? sort.dir < 0
                          ? ' ▼'
                          : ' ▲'
                        : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.name} className={row.games ? '' : 'is-idle'}>
                {COLUMNS.map((column) =>
                  column.key === 'name' ? (
                    <th key="name" scope="row">
                      <a href={playerHref(row.name)}>{row.name}</a>
                    </th>
                  ) : (
                    <td
                      key={column.key}
                      className={sort.key === column.key ? 'is-sorted' : ''}
                    >
                      {column.key === 'rating'
                        ? row.games
                          ? row.rating.toFixed(1)
                          : '—'
                        : row[column.key]}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HeadToHead({ rows }) {
  const initial = useMemo(() => {
    const played = [...rows].sort((a, b) => b.games - a.games);
    return [played[0]?.name ?? '', played[1]?.name ?? played[0]?.name ?? ''];
  }, [rows]);
  const [nameA, setNameA] = useState(initial[0]);
  const [nameB, setNameB] = useState(initial[1]);
  const a = rows.find((row) => row.name === nameA) || rows[0];
  const b = rows.find((row) => row.name === nameB) || rows[0];
  if (!a || !b) return null;
  return (
    <div className="pg-h2h">
      <div className="pg-toolbar">
        <label>
          Pro A
          <select value={a.name} onChange={(e) => setNameA(e.target.value)}>
            {rows.map((row) => (
              <option key={row.name}>{row.name}</option>
            ))}
          </select>
        </label>
        <label>
          Pro B
          <select value={b.name} onChange={(e) => setNameB(e.target.value)}>
            {rows.map((row) => (
              <option key={row.name}>{row.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="lab-duel-names">
        <div>
          <strong>{a.name}</strong>
          <small>{a.games} presenze</small>
        </div>
        <span aria-hidden="true">VS</span>
        <div>
          <strong>{b.name}</strong>
          <small>{b.games} presenze</small>
        </div>
      </div>
      <div className="lab-duel-metrics" role="list">
        {H2H_STATS.map(([label, key, digits]) => {
          const left = a[key];
          const right = b[key];
          const total = Math.max(0.01, left + right);
          return (
            <div key={key} className="lab-duel-row" role="listitem">
              <b className={left > right ? 'ahead' : ''}>
                {cell(left, digits)}
              </b>
              <div>
                <span>{label}</span>
                <div className="lab-duel-bar" aria-hidden="true">
                  <i style={{ width: `${(left / total) * 100}%` }} />
                </div>
              </div>
              <b className={right > left ? 'ahead' : ''}>
                {cell(right, digits)}
              </b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthArchive({ rows }) {
  const months = useMemo(
    () => [...new Set(rows.map((row) => row.month))],
    [rows],
  );
  const [month, setMonth] = useState(months[0] || '');
  const selected = months.includes(month) ? month : months[0];
  const monthRows = rows.filter((row) => row.month === selected);
  return (
    <>
      <div className="pg-toolbar">
        <label>
          Mese
          <select value={selected} onChange={(e) => setMonth(e.target.value)}>
            {months.map((value) => (
              <option key={value} value={value}>
                {formatMonth(value)}
              </option>
            ))}
          </select>
        </label>
        <p className="pg-count" aria-live="polite">
          {monthRows.length} {monthRows.length === 1 ? 'gara' : 'gare'}
        </p>
      </div>
      <div className="pg-table-scroll" tabIndex={0} role="region" aria-label="Partite del mese">
        <table className="pg-table pg-archive">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Avversario</th>
              <th scope="col">Risultato</th>
              <th scope="col">Esito</th>
            </tr>
          </thead>
          <tbody>
            {monthRows.map((row) => {
              const outcome = outcomeOf(row);
              return (
                <tr key={row.matchId}>
                  <td>{formatWhen(row.timestamp)}</td>
                  <th scope="row">{row.opponent || '?'}</th>
                  <td>
                    {row.goalsFor}–{row.goalsAgainst}
                  </td>
                  <td className={`pg-out pg-out-${outcome}`}>
                    <span aria-hidden="true">{outcome}</span>
                    <span className="sr-only">{OUTCOME[outcome]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const OPPONENTS_COLLAPSED = 10;

function OpponentBalance({ rows }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const byName = new Map();
    for (const row of rows) {
      const name = row.opponent || '?';
      const record = byName.get(name) || { name, n: 0, V: 0, P: 0, S: 0, gf: 0, ga: 0 };
      record.n++;
      record[outcomeOf(row)]++;
      record.gf += toNumber(row.goalsFor);
      record.ga += toNumber(row.goalsAgainst);
      byName.set(name, record);
    }
    return [...byName.values()].sort(
      (x, y) => y.n - x.n || x.name.localeCompare(y.name),
    );
  }, [rows]);
  const shown = all ? list : list.slice(0, OPPONENTS_COLLAPSED);
  return (
    <>
      <div className="pg-table-scroll" tabIndex={0} role="region" aria-label="Bilancio contro gli avversari">
        <table className="pg-table">
          <thead>
            <tr>
              <th scope="col">Avversario</th>
              <th scope="col">Gare</th>
              <th scope="col">V</th>
              <th scope="col">P</th>
              <th scope="col">S</th>
              <th scope="col">Gol</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((record) => (
              <tr key={record.name}>
                <th scope="row">{record.name}</th>
                <td>{record.n}</td>
                <td>{record.V}</td>
                <td>{record.P}</td>
                <td>{record.S}</td>
                <td>
                  {record.gf}–{record.ga}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > OPPONENTS_COLLAPSED && (
        <button
          type="button"
          className="pg-more"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? 'Mostra meno' : `Mostra tutti (${list.length})`}
        </button>
      )}
    </>
  );
}

function ArchiveBlock({ archive, children }) {
  if (archive.status === 'loading')
    return <p className="pg-note">Carico l’archivio…</p>;
  if (archive.status === 'error' || !archive.rows.length)
    return <p className="pg-note">Archivio non disponibile al momento.</p>;
  return children(archive.rows);
}

/** Vista `#/statistiche`: record del club, classifica Pro, testa a testa, archivio e bilancio avversari. */
export function StatsPage({ data }) {
  const { clubKey } = useClub();
  const archive = useArchive(clubKey);
  const club = data.club[0];
  const rows = useMemo(
    () => data.members.members.map(toRow),
    [data],
  );
  return (
    <div className="pg">
      <div className="pg-top">
        <span className="overline">STATISTICHE / STAGIONE 2026/27</span>
        <h1>I numeri del club.</h1>
        <p className="sub">
          Record, classifica dei Pro, confronti diretti e il bilancio contro
          chi abbiamo incontrato.
        </p>
      </div>
      <section className="content pg-section" aria-labelledby="st-records">
        <div className="section-head">
          <div>
            <span className="overline">01 / RECORD</span>
            <h2 id="st-records">Record del club.</h2>
          </div>
        </div>
        <ClubRecords club={club} />
      </section>
      <section className="content pg-section" aria-labelledby="st-board">
        <div className="section-head">
          <div>
            <span className="overline">02 / CLASSIFICA</span>
            <h2 id="st-board">Classifica Pro.</h2>
            <p className="sub">
              Scegli il criterio dalle schede oppure tocca l’intestazione di
              una colonna; un secondo tocco inverte l’ordine.
            </p>
          </div>
        </div>
        <Leaderboard rows={rows} />
      </section>
      <section className="content pg-section" aria-labelledby="st-h2h">
        <div className="section-head">
          <div>
            <span className="overline">03 / CONFRONTO</span>
            <h2 id="st-h2h">Testa a testa.</h2>
          </div>
        </div>
        <HeadToHead rows={rows} />
      </section>
      <section className="content pg-section" aria-labelledby="st-archive">
        <div className="section-head">
          <div>
            <span className="overline">04 / ARCHIVIO</span>
            <h2 id="st-archive">Archivio partite.</h2>
          </div>
        </div>
        <ArchiveBlock archive={archive}>
          {(archiveRows) => <MonthArchive rows={archiveRows} />}
        </ArchiveBlock>
      </section>
      <section className="content pg-section" aria-labelledby="st-opps">
        <div className="section-head">
          <div>
            <span className="overline">05 / AVVERSARI</span>
            <h2 id="st-opps">Bilancio contro gli avversari.</h2>
          </div>
        </div>
        <ArchiveBlock archive={archive}>
          {(archiveRows) => <OpponentBalance rows={archiveRows} />}
        </ArchiveBlock>
      </section>
    </div>
  );
}
