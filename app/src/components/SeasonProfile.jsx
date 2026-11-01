import { AdaniComment } from './AdaniComment.jsx';
import { assignQuotes, toQuotePlayer } from '../lib/adani-quotes.js';
import { getEditorialContext } from '../lib/editorial-ctx.js';
import { buildSeasonProfile } from '../lib/season-profile.js';
import { useClub } from '../lib/useClub.js';

/** Ritratto della stagione di un Pro dentro la finestra della figurina. */
export function SeasonProfile({ member, players, recent, data }) {
  const { club } = useClub();
  const ctx = data ? getEditorialContext(data, club.id) : null;
  const profile = buildSeasonProfile(
    member,
    players,
    recent,
    ctx
      ? {
          metrics: ctx.metricsByName.get(member.name.toLowerCase()),
          club: ctx.club,
        }
      : {},
  );
  const quote = assignQuotes(players.map(toQuotePlayer), 'stagione').get(
    member.name,
  );
  return (
    <section
      className="season-profile"
      aria-label={`Ritratto stagionale di ${member.name}`}
    >
      <div className="season-profile-heading">
        <span>IL ROMANZO DELLA STAGIONE</span>
        <b>
          {profile.stage}
          {' · '}
          {member.gamesPlayed}
          {' presenze'}
        </b>
      </div>
      <h4>{profile.title}</h4>
      <p>{profile.intro}</p>
      <AdaniComment player={toQuotePlayer(member)} quote={quote} />
      {profile.sections.map((section) => (
        <div key={section.label} className="season-chapter">
          <strong>{section.label}</strong>
          <p>{section.text}</p>
        </div>
      ))}
      <p className="season-profile-note">{profile.note}</p>
    </section>
  );
}
