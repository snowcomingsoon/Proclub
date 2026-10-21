
function validate({club, members, matches}, clubId) {
  if (!Array.isArray(club) || String(club[0]?.clubId) !== String(clubId)) throw new Error('Statistiche club non valide');
  if (!Number.isFinite(Number(club[0].gamesPlayed))) throw new Error('gamesPlayed non valido');
  if (!Array.isArray(members?.members) || !members.members.length) throw new Error('Membri vuoti');
  if (!Array.isArray(matches)) throw new Error('Partite non valide');
}

function mergeHistory(history, matches) {
  const merge = (old, incoming) => {
    const result = {...old};
    for (const [key,value] of Object.entries(incoming || {})) {
      if (value == null || value === '') continue;
      result[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? merge(old?.[key] || {},value) : value;
    }
    return result;
  };
  const byId=new Map();
  for(const m of history || [])if(m?.matchId)byId.set(String(m.matchId),merge(byId.get(String(m.matchId))||{},m));
  const oldIds=new Set(byId.keys());
  for(const m of matches || [])if(m?.matchId)byId.set(String(m.matchId),merge(byId.get(String(m.matchId))||{},m));
  const merged=[...byId.values()].sort((a,b)=>b.timestamp-a.timestamp);
  return {history:merged,fresh:merged.filter(m=>!oldIds.has(String(m.matchId)))};
}

function seasonKey(ts) {
  const d = new Date((ts - 6 * 3600) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function notify(fresh, clubId) {
  if (!fresh.length) return;
  const lines = fresh.map(m => {
    const c = m.clubs?.[clubId];
    const opp = Object.entries(m.clubs || {}).find(([id]) => id !== String(clubId))?.[1]?.details?.name ?? '?';
    return `${c?.goals}–${c?.goalsAgainst} vs ${opp}`;
  });
  const text = `BILLOCCHI CLUB: ${fresh.length} nuove partite\n${lines.join('\n')}`;
  const jobs = [];
  if (process.env.DISCORD_WEBHOOK) jobs.push(fetch(process.env.DISCORD_WEBHOOK, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content: text})}));
  if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT) jobs.push(fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({chat_id: process.env.TELEGRAM_CHAT, text})}));
  await Promise.allSettled(jobs);
}

module.exports = {validate, mergeHistory, seasonKey, notify};
