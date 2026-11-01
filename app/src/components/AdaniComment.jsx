import { AdaniMini } from './AdaniMini.jsx';
import { adaniNote } from '../lib/adani-quotes.js';
import { useClub } from '../lib/useClub.js';

/** Commento "della redazione" con la citazione abbinata e il riepilogo del Pro. */
export function AdaniComment({ player, quote }) {
  const { club } = useClub();
  const summary = adaniNote(player);
  return (
    <aside
      className="adani-comment"
      aria-label={`Archivio Adani per ${player.name}`}
    >
      <AdaniMini />
      <div>
        <span className="adani-kicker">LA VOCE DI ADANI · ARCHIVIO</span>
        <blockquote>«{quote.text}»</blockquote>
        <p>{summary}</p>
        <details>
          <summary>Citazione e fonte</summary>
          <p>
            {quote.context}{' '}
            <a href={quote.url} target="_blank" rel="noreferrer">
              {quote.source}
            </a>
          </p>
          <small>
            Citazione di Lele Adani. L’abbinamento e il commento sul giocatore
            sono della redazione {club.short}.
          </small>
        </details>
      </div>
    </aside>
  );
}
