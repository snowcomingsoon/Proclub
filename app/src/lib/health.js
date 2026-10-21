const HOUR = 3600e3;
/** Fuori dalla fascia serale si tollera molto di più: di giorno si gioca poco. */
const EVENING_STALL_MS = 3 * HOUR;
const OFF_HOURS_STALL_MS = 12 * HOUR;

const romeParts = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { hour: Number(parts.hour), label: `${parts.hour}:${parts.minute}` };
};

/** Ora italiana (HH:MM) di un istante ISO. */
export const romeClock = (iso) => romeParts(new Date(iso)).label;

/** Fascia serale in cui si gioca: dalle 19:00 alle 03:00 ora italiana. */
export const isEveningRome = (date) => {
  const { hour } = romeParts(date);
  return hour >= 19 || hour < 3;
};

/**
 * Nota sobria se la raccolta sembra ferma, altrimenti null.
 * Si basa sull'ultimo controllo (`checkedAt`), non su `capturedAt`: senza partite i dati non cambiano.
 * Soglia: 3 ore se adesso è sera (19:00–03:00 italiane), 12 ore altrimenti.
 */
export function stallNotice(health, now = Date.now()) {
  const checked = Date.parse(health?.checkedAt);
  if (Number.isNaN(checked)) return null;
  const limit = isEveningRome(new Date(now)) ? EVENING_STALL_MS : OFF_HOURS_STALL_MS;
  if (now - checked <= limit) return null;
  return `La raccolta dati non risponde dalle ${romeClock(health.checkedAt)}: i numeri potrebbero non essere aggiornati.`;
}

/** Riga sobria sulle partite giocate ma non restituite da EA, o null. */
export function lostMatchesNote(health) {
  const lost = Number(health?.lostClubMatches);
  if (!Number.isFinite(lost) || lost <= 0) return null;
  return lost === 1
    ? 'Una partita del club non è stata restituita da EA e non compare nei numeri.'
    : `${lost} partite del club non sono state restituite da EA e non compaiono nei numeri.`;
}
