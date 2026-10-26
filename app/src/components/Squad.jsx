import { ArrowUpRight } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { computeCardProfile } from '../lib/card-profile.js';
import { formatProOverall } from '../lib/format.js';
import { playerHref } from '../lib/route.js';
import { toNumber } from '../lib/stats.js';

/** Dialog della figurina: chunk separato, precaricato appena il browser è libero. */
const loadCardDialog = () => import('./CardDialog.jsx');
const CardDialog = lazy(() =>
  loadCardDialog().then((module) => ({ default: module.CardDialog })),
);

const playerPortraits = { we_belen: '/cards/we-belen-portrait-v2.webp', garrus92: '/cards/garrus92-portrait.webp', scemo897: '/cards/scemo897-portrait.webp' };

function LeaderList({ cards, setSelectedName }) {
  return (
    <div className="leader-list">
      {cards.map(({ member, profile }, index) => (
        <button
          key={member.name}
          className="leader-entry"
          onClick={() => setSelectedName(member.name)}
          aria-label={`Posizione ${index + 1}, ${member.name}, ${toNumber(member.goals) + toNumber(member.assists)} gol più assist. Apri la pagella`}
        >
          <span className="leader-entry-rank">
            #{String(index + 1).padStart(2, '0')}
          </span>
          <span
            className={`leader-mini-card ${profile.tier} ${profile.hot ? 'on-fire' : ''} ${playerPortraits[member.name.toLowerCase()] ? 'has-portrait' : ''}`}
            aria-hidden="true"
          >
            {playerPortraits[member.name.toLowerCase()] && <img className="leader-mini-portrait" src={playerPortraits[member.name.toLowerCase()]} alt="" loading="lazy" decoding="async" />}
            <span>{formatProOverall(member)}</span>
          </span>
          <span className="leader-entry-name">
            <strong>{member.name}</strong>
            <small>
              {profile.label}
              {' · '}
              {member.gamesPlayed}
              {' PRESENZE'}
              {profile.basis === 'season' ? ' · INDICE STAGIONALE' : ''}
              {profile.hot ? ' · ON FIRE' : ''}
            </small>
          </span>
          <span className="leader-entry-breakdown">
            <b>
              {member.goals}
              {' G'}
            </b>
            <b>
              {member.assists}
              {' A'}
            </b>
          </span>
          <span className="leader-entry-total">
            <strong>{toNumber(member.goals) + toNumber(member.assists)}</strong>
            <small>G + A</small>
          </span>
          <ArrowUpRight className="leader-arrow" size={17} />
        </button>
      ))}
    </div>
  );
}

/**
 * "La rosa": classifica dei Pro per gol + assist e finestra con la pagella.
 * `members` è la rosa già ordinata, `matches` le ultime gare EA.
 */
export function Squad({ members, matches, data }) {
  const [selectedName, setSelectedName] = useState(null);
  const cards = members.map((member) => ({
    member,
    profile: computeCardProfile(member, matches),
  }));
  useEffect(() => {
    const idle =
      window.requestIdleCallback || ((callback) => setTimeout(callback, 1500));
    const handle = idle(() => loadCardDialog());
    return () => (window.cancelIdleCallback || clearTimeout)(handle);
  }, []);
  const selectedCard = cards.find((card) => card.member.name === selectedName);
  useEffect(() => {
    if (!selectedName) return;
    const onKeyDown = (event) => {
      event.key === 'Escape' && setSelectedName(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedName]);
  return (
    <section className="content squad" id="rosa">
      <div className="section-head">
        <div>
          <span className="overline">03 / LA ROSA</span>
          <h2>La classifica dei Pro.</h2>
          <p className="sub">
            Tutti i profili EA in un colpo d’occhio. La graduatoria segue gol +
            assist stagionali; apri un giocatore per la figurina, la pagella e
            il ritratto della sua stagione, più ricco man mano che aumentano le
            presenze.
          </p>
        </div>
        <div className="count">
          {String(members.length).padStart(2, '0')} <small>PROFILI EA</small>
        </div>
      </div>
      <div className="leaderboard-head">
        <span>LEADERBOARD · STAGIONE 2026/27</span>
        <span>GOL + ASSIST</span>
      </div>
      <LeaderList cards={cards} setSelectedName={setSelectedName} />
      <p className="role-note">
        Classifica sui gol + assist stagionali EA, considerando tutti i ruoli.
        Il numero grande della figurina è l'overall del Pro fornito da EA:
        misura l'avatar, non il rendimento del giocatore. Colore e indice di
        forma sono valutazioni del sito sulle gare recenti nel ruolo indicato.
        Se mancano gare recenti, il colore usa i totali stagionali di tutti i
        ruoli; chi non ha presenze resta non classificato.
      </p>
      {selectedCard && (
        <Suspense fallback={null}>
        <CardDialog
          data={data}
          selectedCard={selectedCard}
          members={members}
          setSelectedName={setSelectedName}
        />
        </Suspense>
      )}
    </section>
  );
}
