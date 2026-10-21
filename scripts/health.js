'use strict';
// data/public/health.json: stato della raccolta, letto dal sito e dal workflow che apre le issue.

/** Fallimenti reali: endpoint EA in errore + discrepanze non transitorie (le "pending" sono attese entro la tolleranza di 12h). */
function failuresOf(status) {
  const out = {...(status?.endpointFailures || {})};
  for (const issue of status?.issues || []) {
    if (issue.pending) continue;
    out[`integrity:${issue.key}`] = [issue.kind, issue.name].filter(Boolean).join(' ');
  }
  return out;
}

/**
 * `status` = collectionStatus dell'esecuzione; `previous` = health.json precedente.
 * `advance`: false per ricostruzioni offline che non corrispondono a una nuova esecuzione.
 */
function buildHealth({status, data, previous, now, engine, advance = true, season}) {
  const failures = failuresOf(status);
  const failed = Object.keys(failures).length > 0;
  const before = previous?.consecutiveFailures || 0;
  const consecutiveFailures = advance ? (failed ? before + 1 : 0) : before;
  const failing = advance ? failed : before > 0;
  return {
    version: 1,
    checkedAt: now,
    capturedAt: data?.capturedAt || null,
    complete: !!status?.complete && !failed,
    failures,
    stale: {...(status?.stale || {})},
    lostClubMatches: status?.lostClubMatches || 0,
    writtenOff: (status?.writtenOff || []).slice(-20),
    season: season || data?.season || null,
    consecutiveFailures,
    failingSince: failing ? (before > 0 && previous?.failingSince ? previous.failingSince : now) : null,
    lastSuccessAt: advance ? (failed ? previous?.lastSuccessAt || null : now) : previous?.lastSuccessAt || null,
    engine: engine || {ok: true},
  };
}

/** Salvataggio d'emergenza quando la raccolta va in errore prima di produrre uno stato. */
function crashHealth({previous, now, error}) {
  const before = previous?.consecutiveFailures || 0;
  return {
    ...(previous || {version: 1, capturedAt: null, complete: false, stale: {}, lostClubMatches: 0, writtenOff: [], season: null, engine: {ok: true}}),
    version: 1, checkedAt: now, complete: false, failures: {crash: String(error?.message || error)},
    consecutiveFailures: before + 1, failingSince: before > 0 && previous?.failingSince ? previous.failingSince : now,
    lastSuccessAt: previous?.lastSuccessAt || null,
  };
}

module.exports = {failuresOf, buildHealth, crashHealth};
