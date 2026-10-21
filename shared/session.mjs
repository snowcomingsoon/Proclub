/**
 * Giorno della "serata" di una gara: nel fuso del club le partite tra mezzanotte e `nightEndsAtHour`
 * (default 06:00) appartengono alla serata del giorno prima. Stessa regola del sito (app/src/lib/matches.js).
 * `timestamp` in secondi (numero o stringa). Ritorna 'YYYY-MM-DD'.
 */
export function sessionDay(timestamp, tz = 'Europe/Rome', nightEndsAtHour = 6) {
  const date = new Date(Number(timestamp) * 1e3);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const [year, month, day, hour] = ['year', 'month', 'day', 'hour'].map((type) => Number(get(type)));
  if (hour >= nightEndsAtHour) return `${get('year')}-${get('month')}-${get('day')}`;
  return new Date(Date.UTC(year, month - 1, day - 1, 12)).toISOString().slice(0, 10);
}
