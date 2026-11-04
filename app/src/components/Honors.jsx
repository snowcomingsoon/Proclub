import { useMemo } from 'react';
import { HONOR_FAMILIES, HONOR_TIERS, clubHonors, honorsFor } from '../../../shared/honors.mjs';
import { appearancesFor, buildAll } from '../../../shared/metrics.mjs';
import { playerHref } from '../lib/route.js';

const fmt = (value, digits) => (digits ? Number(value).toFixed(digits) : String(Math.round(value)));
const TIER_KEYS = ['bronze', 'silver', 'gold', 'platinum', 'legend'];
const sourceNote = (h) => (h.source === 'archivio' ? ' · dall’archivio partite' : '');

function Medal({ h }) {
  return (
    <li className={`honor tier-${TIER_KEYS[h.tier]}`}>
      <span className="honor-tier">{h.tierName}</span>
      <b>{h.title}</b>
      <small>
        {fmt(h.value, h.digits)} {h.verb}
        {h.next != null ? ` · prossimo livello a ${fmt(h.next, h.digits)}` : ' · livello massimo'}
        {sourceNote(h)}
      </small>
      {h.next != null && (
        <span className="honor-track" aria-hidden="true">
          <i style={{ width: `${Math.round(h.progress * 100)}%` }} />
        </span>
      )}
    </li>
  );
}

function Goal({ h }) {
  return (
    <li className="honor is-goal">
      <span className="honor-tier">{h.locked ? `Dalla presenza ${h.min}` : `Verso ${HONOR_TIERS[h.tier + 1]}`}</span>
      <b>{h.title}</b>
      <small>
        {h.locked ? `servono ${h.min} presenze` : `${fmt(h.value, h.digits)} / ${fmt(h.next, h.digits)} ${h.verb}`}
        {sourceNote(h)}
      </small>
      <span className="honor-track" aria-hidden="true">
        <i style={{ width: `${Math.round(h.progress * 100)}%` }} />
      </span>
    </li>
  );
}

/** Pagina del Pro: menzioni conquistate (per livello) e le prossime del suo reparto. */
export function HonorsSection({ member, appearances, family }) {
  const { earned, inProgress, points } = useMemo(
    () => honorsFor(member, appearances, family),
    [member, appearances, family],
  );
  const goals = inProgress.filter((h) => h.tier < 0).slice(0, 4);
  if (!earned.length && !goals.length) return null;
  return (
    <section className="content pg-section" aria-labelledby="pl-honors">
      <div className="section-head">
        <div>
          <span className="overline">MENZIONI D’ONORE</span>
          <h2 id="pl-honors">I traguardi.</h2>
          <p className="sub">
            {earned.length
              ? `${earned.length} menzioni conquistate, ${points} punti onore. Cinque livelli per traguardo: ${HONOR_TIERS.join(', ')}.`
              : 'Nessuna menzione ancora: i primi traguardi sono vicini.'}
          </p>
        </div>
      </div>
      {earned.length > 0 && (
        <ul className="honors">
          {earned.map((h) => <Medal key={h.id} h={h} />)}
        </ul>
      )}
      {goals.length > 0 && (
        <>
          <h3 className="honors-sub">Prossimi traguardi</h3>
          <ul className="honors">
            {goals.map((h) => <Goal key={h.id} h={h} />)}
          </ul>
        </>
      )}
    </section>
  );
}

/** Statistiche: bacheca del club, un Pro per riga con le sue menzioni migliori. */
export function HonorsBoard({ data, clubId }) {
  const rows = useMemo(() => {
    const families = new Map(buildAll(data, clubId).map((m) => [m.name, m.roleFamily]));
    const history = data.matchHistory || [];
    return clubHonors(
      data.members.members,
      (name) => appearancesFor(history, name, clubId),
      (name) => families.get(name) || 'mid',
    );
  }, [data, clubId]);
  if (!rows.length) return null;
  return (
    <ol className="honor-board">
      {rows.map((row, index) => (
        <li key={row.name} className="honor-row">
          <span className="honor-rank">#{String(index + 1).padStart(2, '0')}</span>
          <a href={playerHref(row.name)}>{row.name}</a>
          <span className="honor-count" aria-label={`${row.total} menzioni, ${row.points} punti onore`}>
            <b>{row.points}</b> punti · {row.total} menzioni
          </span>
          <span className="honor-dots" aria-hidden="true">
            {row.byTier.map((count, i) => count > 0 && (
              <i key={HONOR_TIERS[i]} className={`tier-${TIER_KEYS[i]}`} title={`${HONOR_TIERS[i]} ×${count}`}>{count}</i>
            ))}
          </span>
          <span className="honor-best">
            {row.best.map((h) => `${h.title} (${h.tierName})`).join(' · ')}
          </span>
        </li>
      ))}
    </ol>
  );
}

export const HONOR_FAMILY_COUNT = HONOR_FAMILIES.length;
