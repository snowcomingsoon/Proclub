import { ROLE_INFO, roleFor } from '../../../../shared/metrics.mjs';
import { formatNumber } from '../../lib/format.js';
import { getClubPlayers, getOpponentName } from '../../lib/matches.js';
import { POSITION_NAMES } from '../../lib/positions.js';
import { toNumber } from '../../lib/stats.js';

function FormCurve({ formGames, formPlayer, formRole }) {
  return (
    <div
      className="lab-curve"
      aria-label={`Voti di ${formPlayer} nel reparto ${POSITION_NAMES[formRole]}, dal più vecchio al più recente`}
    >
      {formGames.map(({ match, entry }, index) => (
        <div
          key={match.matchId}
          className={`lab-curve-game ${entry ? '' : 'absent'}`}
        >
          <span>{entry ? entry.rating : '—'}</span>
          <div className="lab-curve-track">
            {entry && (
              <i
                style={{
                  height: `${Math.max(0, Math.min(100, toNumber(entry.rating) * 10))}%`,
                }}
              />
            )}
          </div>
          <b>
            {'GARA '}
            {index + 1}
          </b>
          <small>{getOpponentName(match)}</small>
          <em>
            {entry
              ? `${entry.goals}G · ${entry.assists}A`
              : getClubPlayers(match).some(
                    (player) => player.playername === formPlayer,
                  )
                ? 'Altro reparto'
                : 'Non presente'}
          </em>
        </div>
      ))}
    </div>
  );
}

export function CurvePanel({
  formGames,
  formPlayer,
  formRole,
  formRoles,
  formSummary,
  playerNames,
  previousEntries,
  ratingDelta,
  setFormPlayerChoice,
  setFormRoleChoice,
  sortedMatches,
}) {
  const passMin = ROLE_INFO[roleFor(formRole, null)].passMin;
  return (
    <div
      className="lab-panel"
      id="panel-forma"
      role="tabpanel"
      aria-labelledby="tab-forma"
    >
      <div className="lab-toolbar">
        <label>
          Il tuo Pro
          <select
            value={formPlayer || ''}
            onChange={(event) => {
              setFormPlayerChoice(event.target.value);
              setFormRoleChoice('');
            }}
          >
            {playerNames.map((playerName) => (
              <option key={playerName}>{playerName}</option>
            ))}
          </select>
        </label>
        <label>
          Reparto osservato
          <select
            value={formRole || ''}
            onChange={(event) => setFormRoleChoice(event.target.value)}
          >
            {formRoles.map((role) => (
              <option key={role} value={role}>
                {POSITION_NAMES[role] || role}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="lab-curve-head">
        <div>
          <span className="overline">
            {POSITION_NAMES[formRole] || 'REPARTO'}
            {' / '}
            {formSummary.games}
            {' PRESENZE'}
          </span>
          <h3>{formPlayer || 'Nessun Pro disponibile'}</h3>
          <p>
            {ratingDelta === null
              ? 'Servono due presenze nello stesso reparto per confrontare l’ultimo voto.'
              : `${ratingDelta >= 0 ? '+' : ''}${ratingDelta.toFixed(1)} nell’ultima gara rispetto alla media delle ${previousEntries.length} precedenti in questo reparto.`}
          </p>
        </div>
        <strong>
          {formatNumber(formSummary.rating, 1)}
          <small>VOTO MEDIO EA</small>
        </strong>
      </div>
      <FormCurve
        formGames={formGames}
        formPlayer={formPlayer}
        formRole={formRole}
      />
      <div className="lab-stat-grid">
        <div>
          <strong>{formSummary.goals}</strong>
          <span>GOL</span>
        </div>
        <div>
          <strong>{formSummary.assists}</strong>
          <span>ASSIST</span>
        </div>
        <div>
          <strong>
            {formatNumber(formSummary.pass)}
            {formSummary.pass === null ? '' : '%'}
          </strong>
          <span>
            {'PASSAGGI · '}
            {formSummary.passes}/{formSummary.attempts}
          </span>
        </div>
        <div>
          <strong>{formSummary.tackles}</strong>
          <span>CONTRASTI RIUSCITI</span>
        </div>
      </div>
      <div className="lab-story">
        <span>IL PUNTO DA CURARE</span>
        <h3>
          {formSummary.games
            ? formSummary.attempts >= 10 && toNumber(formSummary.pass) < passMin
              ? 'La precisione può crescere.'
              : formSummary.shots >= 5 && formSummary.goals === 0
                ? 'Tiri senza gol: da rifinire.'
                : ratingDelta !== null && ratingDelta < 0
                  ? 'Ultima gara sotto il proprio livello.'
                  : 'Nessun aspetto critico netto.'
            : 'Nessuna presenza da giudicare.'}
        </h3>
        <p>
          {formSummary.games
            ? formSummary.attempts >= 10 && toNumber(formSummary.pass) < passMin
              ? `${formSummary.attempts - formSummary.passes} passaggi non riusciti su ${formSummary.attempts}: ${formSummary.pass}% di precisione. Qualche appoggio più semplice può aiutare il possesso.`
              : formSummary.shots >= 5 && formSummary.goals === 0
                ? `${formSummary.shots} tiri senza un gol nelle gare osservate: conclusioni da scegliere con più lucidità. Dai dati non si deduce la qualità delle occasioni.`
                : ratingDelta !== null && ratingDelta < 0
                  ? `Ultima gara ${Math.abs(ratingDelta).toFixed(1)} punti sotto la media delle precedenti (${formatNumber(formSummary.rating, 1)} di media EA in ${formSummary.games} presenze): un calo da recuperare nella prossima gara.`
                  : `${formatNumber(formSummary.rating, 1)} di media EA in ${formSummary.games} presenze nel reparto: nessun difetto netto nei dati disponibili.`
            : 'Nessuna presenza consultabile.'}
        </p>
      </div>
      <p className="lab-note">
        {'Solo le ultime '}
        {sortedMatches.length}
        {
          ' gare di campionato disponibili da EA. I reparti non vengono mescolati; EA distingue ATT, CEN, DIF e POR, non le singole posizioni come COC e CDC. Una gara in un altro reparto o un’assenza resta vuota, non vale zero. Il campione è breve: descrive queste gare, non tutta la stagione.'
        }
      </p>
    </div>
  );
}
