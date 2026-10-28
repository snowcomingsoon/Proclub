import { useEvolution } from './Evolution.jsx';
import { formatProOverall } from '../lib/format.js';

/** Figurina da collezione di un Pro (tier e "on fire" dal profilo calcolato). */
export function CollectorCard({ member, profile, onClick }) {
  const portrait = {we_belen: '/cards/we-belen-portrait-v2.webp', garrus92: '/cards/garrus92-portrait-v2.webp', scemo897: '/cards/scemo897-portrait.webp'}[member.name.toLowerCase()];
  const evolution=useEvolution(member.name);
  const evolved=evolution?.level>0;
  const stats = [
    [member.goals, 'GOL'],
    [member.assists, 'AST'],
    [member.gamesPlayed, 'PRE'],
    [`${member.passSuccessRate}%`, 'PAS'],
    [member.tacklesMade, 'CTR'],
    [member.ratingAve, 'MED'],
  ];
  // Senza onClick la figurina è solo illustrativa (pagina del giocatore).
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`collector-card ${profile.tier} ${evolved ? `evo-${evolution.tier.key}` : ''} ${profile.hot ? 'on-fire' : ''}`}
      onClick={onClick}
      role={onClick ? undefined : 'img'}
      aria-label={`${member.name}, overall EA ${formatProOverall(member)}, ${profile.label}, ${member.goals} gol e ${member.assists} assist stagionali${profile.hot ? ', in forma eccezionale' : ''}${evolved ? `, evoluzione ${evolution.tier.name}` : ''}${onClick ? '. Apri la pagella' : ''}`}
    >
      {evolved&&<><span className="collector-evolution" aria-hidden="true"><i>✦</i><i>✧</i></span><span className="collector-evo-label">{evolution.tier.name.toUpperCase()}</span></>}
      <span className="collector-rating">
        {formatProOverall(member)}
        <small>{profile.label}</small>
      </span>
      <img
        className="collector-crest"
        src="/logo-billocchi.svg"
        alt=""
        width="40"
        height="40"
        loading="lazy"
        decoding="async"
      />
      <span className="collector-tier">
        {profile.basis === 'season'
          ? `INDICE STAG. ${profile.score}`
          : profile.basis === 'recent'
            ? `FORMA ${profile.score}`
            : 'EA OVERALL'}
      </span>
      {profile.hot && <span className="collector-fire-label">ON FIRE</span>}
      {portrait ? (
        <img
          className={`collector-player-image ${['garrus92', 'we_belen', 'scemo897'].includes(member.name.toLowerCase()) ? 'collector-player-closeup' : ''}`}
          src={portrait}
          alt=""
          width={member.name.toLowerCase() === 'garrus92' ? 1089 : 1145}
          height={member.name.toLowerCase() === 'garrus92' ? 1444 : member.name.toLowerCase() === 'scemo897' ? 1374 : 1373}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="collector-portrait" aria-hidden="true">
          {member.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="collector-name">{member.name}</span>
      <span className="collector-stats">
        {stats.map(([value, label]) => (
          <span key={label}>
            <b>{value}</b>
            <small>{label}</small>
          </span>
        ))}
      </span>
    </Tag>
  );
}
