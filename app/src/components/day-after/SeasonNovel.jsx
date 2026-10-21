import { BookOpen } from 'lucide-react';
import { toQuotePlayer } from '../../lib/adani-quotes.js';
import { formatRating } from '../../lib/format.js';
import { toFiniteNumber } from '../../lib/stats.js';
import { AdaniComment } from '../AdaniComment.jsx';

function RoleTrendChart({ roleTrend }) {
  return (
    <div className="paper-trend">
      <div>
        <span>
          {'L’ARCO RECENTE / '}
          {roleTrend.role}
        </span>
        <strong>
          {roleTrend.delta === null
            ? 'Poche gare con voto: nessuna tendenza leggibile.'
            : roleTrend.delta >= 0.3
              ? 'Voti in risalita: da confermare nelle prossime gare.'
              : roleTrend.delta <= -0.3
                ? 'Voti in lieve calo: il rendimento recente può risalire.'
                : 'Voti stabili: nessun salto, in un senso o nell’altro.'}
        </strong>
      </div>
      {roleTrend.points.length > 0 && (
        <svg
          viewBox="0 0 320 90"
          role="img"
          aria-label={`Voti EA cronologici nelle ${roleTrend.points.length} presenze archiviate da ${roleTrend.role}: ${roleTrend.points.map((point) => point.rating).join(', ')}`}
        >
          <line x1="10" y1="74" x2="310" y2="74" />
          <line x1="10" y1="39" x2="310" y2="39" />
          {roleTrend.points.length > 1 && (
            <polyline
              points={roleTrend.points
                .map(
                  (point, index) =>
                    `${10 + (index * 300) / (roleTrend.points.length - 1)},${81 - point.rating * 7}`,
                )
                .join(' ')}
            />
          )}
          {roleTrend.points.map((point, index) => (
            <circle
              key={point.matchId}
              cx={
                roleTrend.points.length === 1
                  ? 160
                  : 10 + (index * 300) / (roleTrend.points.length - 1)
              }
              cy={81 - point.rating * 7}
              r="3.5"
            />
          ))}
        </svg>
      )}
      <p>
        {roleTrend.delta === null
          ? `${roleTrend.points.length} presenze con voto archiviate nell’ultimo reparto giocato (${roleTrend.role}). Il confronto tra due blocchi parte da quattro presenze con voto nello stesso reparto.`
          : `Le ultime ${roleTrend.recentCount} presenze archiviate da ${roleTrend.role} valgono ${formatRating(roleTrend.recent)}, contro ${formatRating(roleTrend.previous)} nelle ${roleTrend.previousCount} precedenti: ${roleTrend.delta >= 0 ? '+' : ''}${roleTrend.delta.toFixed(2)} punti EA. ${roleTrend.recent < 7 ? 'Margine di crescita ancora ampio. ' : ''}Il confronto usa lo stesso reparto.`}
      </p>
      {roleTrend.points.length > 1 && (
        <small>
          {new Date(roleTrend.points[0].date * 1e3).toLocaleDateString(
            'it-IT',
            {
              timeZone: 'Europe/Rome',
            },
          )}
          {' — '}
          {new Date(roleTrend.points.at(-1).date * 1e3).toLocaleDateString(
            'it-IT',
            {
              timeZone: 'Europe/Rome',
            },
          )}
          {' · '}
          {roleTrend.points.length}
          {' voti archiviati · dal più vecchio al più recente'}
        </small>
      )}
    </div>
  );
}

function SeasonIndex({ protagonist, seasonProfile }) {
  return (
    <aside className="paper-season-index">
      <BookOpen size={23} />
      <span>{seasonProfile.stage}</span>
      <h4>{protagonist.name}</h4>
      <div>
        <b>{protagonist.gamesPlayed}</b>
        <span>PRESENZE STAGIONALI</span>
      </div>
      <div className="paper-season-totals">
        <span>
          <b>{protagonist.goals}</b>
          {' GOL'}
        </span>
        <span>
          <b>{protagonist.assists}</b>
          {' ASSIST'}
        </span>
      </div>
      <p>
        {'Media EA '}
        <strong>
          {toFiniteNumber(protagonist.gamesPlayed)
            ? protagonist.ratingAve
            : '—'}
        </strong>
        <br />
        Totali stagionali · tutti i ruoli
      </p>
      <a href="#rosa">Apri le figurine del club</a>
    </aside>
  );
}

function SeasonStory({ protagonist, roleTrend, seasonProfile, seasonQuotes }) {
  return (
    <article className="paper-season-story">
      <h4>{seasonProfile.title}</h4>
      <p>{seasonProfile.intro}</p>
      <AdaniComment
        player={toQuotePlayer(protagonist)}
        quote={seasonQuotes.get(protagonist.name)}
      />
      {roleTrend && <RoleTrendChart roleTrend={roleTrend} />}
      <div className="paper-chapters">
        {seasonProfile.sections.map((section, index) => (
          <details key={section.label}>
            <summary>
              <span>
                {'CAPITOLO '}
                {String(index + 1).padStart(2, '0')}
              </span>
              <strong>{section.label}</strong>
            </summary>
            <p>{section.text}</p>
          </details>
        ))}
      </div>
    </article>
  );
}

export function SeasonNovel({
  members,
  protagonist,
  roleTrend,
  seasonProfile,
  seasonQuotes,
  setProtagonistChoice,
}) {
  return (
    <section className="paper-season" id="romanzo">
      <div className="paper-section-heading">
        <div>
          <span>03 / IL ROMANZO DEI PRO</span>
          <h3>La stagione, letta con onestà.</h3>
        </div>
        <label>
          Scegli il protagonista
          <select
            aria-label="Protagonista del romanzo"
            value={protagonist.name}
            onChange={(event) => setProtagonistChoice(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.name} value={member.name}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="paper-longread">
        <summary>
          {'Leggi il ritratto e l’andamento di '}
          {protagonist.name}
        </summary>
        <div className="paper-season-layout">
          <SeasonIndex
            protagonist={protagonist}
            seasonProfile={seasonProfile}
          />
          <SeasonStory
            protagonist={protagonist}
            roleTrend={roleTrend}
            seasonProfile={seasonProfile}
            seasonQuotes={seasonQuotes}
          />
        </div>
      </details>
    </section>
  );
}
