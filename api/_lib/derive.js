// Ricostruisce i file pubblici (summary, night, history, health) dal monolite data.json del club.
// Serve solo come ultima rete di sicurezza (e in dev) quando public/ non è disponibile.
'use strict';

const DEFAULT_CLUB_ID = '70375';
const SUMMARY_MATCHES = 30;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Giorno di serata (ora italiana): 00:00–05:59 appartiene alla serata precedente. */
function sessionDay(timestamp, tz = 'Europe/Rome') {
  const date = new Date(num(timestamp) * 1e3);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (Number(parts.hour) >= 6) return day;
  const prev = new Date(`${day}T12:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

const isComplete = (m, clubId = DEFAULT_CLUB_ID) => !!(m && m.matchId && m.clubs?.[clubId]);

function historyOf(data, clubId = DEFAULT_CLUB_ID) {
  const byId = new Map();
  // matchHistory vince sui doppioni: i suoi record sono quelli completi dello storico
  for (const m of [...(data.matches || []), ...(data.matchHistory || [])])
    if (isComplete(m, clubId)) byId.set(String(m.matchId), m);
  // più recente prima, come nel monolite
  return [...byId.values()].sort((a, b) => num(b.timestamp) - num(a.timestamp));
}

function nightsOf(history) {
  const nights = new Map();
  for (const m of history) {
    const day = sessionDay(m.timestamp);
    const n = nights.get(day) || { day, games: 0, from: Infinity, to: 0 };
    n.games += 1;
    n.from = Math.min(n.from, num(m.timestamp));
    n.to = Math.max(n.to, num(m.timestamp));
    nights.set(day, n);
  }
  return [...nights.values()].sort((a, b) => b.day.localeCompare(a.day));
}

function summaryFrom(data, clubId = DEFAULT_CLUB_ID) {
  const history = historyOf(data, clubId);
  const recent = (data.matches || []).filter((m) => isComplete(m, clubId));
  return {
    version: 2,
    capturedAt: data.capturedAt,
    club: data.club,
    members: data.members,
    matches: (recent.length ? recent : history).slice(0, SUMMARY_MATCHES),
    nights: nightsOf(history),
    matchCount: history.length,
    season: data.collectionStatus?.startedAt
      ? { startedAt: data.collectionStatus.startedAt }
      : null,
  };
}

function nightFrom(data, day, clubId = DEFAULT_CLUB_ID) {
  const matches = historyOf(data, clubId).filter((m) => sessionDay(m.timestamp) === day);
  return matches.length ? { day, matches } : null;
}

function historyFrom(data, clubId = DEFAULT_CLUB_ID) {
  return { version: 1, matchHistory: historyOf(data, clubId) };
}

function healthFrom(data) {
  const cs = data.collectionStatus || {};
  return {
    version: 1,
    checkedAt: cs.checkedAt || data.capturedAt,
    capturedAt: data.capturedAt,
    complete: cs.complete !== false,
    failures: cs.endpointFailures || {},
    stale: cs.stale || {},
    lostClubMatches: num(cs.lostClubMatches),
    writtenOff: cs.writtenOff || [],
    season: cs.startedAt ? { startedAt: cs.startedAt } : null,
    consecutiveFailures: 0,
    engine: { ok: true },
  };
}

module.exports = {
  sessionDay,
  summaryFrom,
  nightFrom,
  historyFrom,
  healthFrom,
};
