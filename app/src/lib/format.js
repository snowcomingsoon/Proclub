import { getActiveClubId } from './constants.js';
import { toNumber } from './stats.js';

export const formatNumber = (value, digits = 0) =>
  value === null ? '—' : value.toFixed(digits);

export const formatRating = (value) =>
  value === null ? '—' : value.toFixed(2);

export const formatLongDate = (day) =>
  new Date(day + 'T12:00:00Z').toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const formatMatchTime = (match) =>
  new Date(match.timestamp * 1e3).toLocaleTimeString('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatScore = (match, clubId = getActiveClubId()) =>
  `${match.clubs?.[clubId]?.goals}–${match.clubs?.[clubId]?.goalsAgainst}`;

export const formatProOverall = (member) =>
  toNumber(member.proOverall) > 0 ? String(member.proOverall) : '—';
