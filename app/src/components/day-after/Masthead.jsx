import { useClub } from '../../lib/useClub.js';

export function Masthead() {
  const { club, clubKey } = useClub();
  return (
    <header className="paper-masthead">
      <img
        src={club.logo}
        alt={`Stemma ${club.name}`}
        width={clubKey === 'faida' ? '88' : '80'}
        height={clubKey === 'faida' ? '88' : '90'}
        decoding="async"
      />
      <div>
        <h1>{clubKey === 'faida' ? 'FAIDA FC' : 'BILLOCCHI'}</h1>
        <p>{club.masthead}</p>
      </div>
      <span>
        {clubKey === 'faida' ? 'IL DOSSIER DEL CLUB' : 'LA GAZZETTA DEL CLUB'}
        <br />
        CRONACA · PAGELLE · VERDETTI
        <br />
        <b>{club.redazione}</b>
      </span>
    </header>
  );
}
