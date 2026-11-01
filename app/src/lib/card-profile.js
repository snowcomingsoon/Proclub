import { getActiveClubId } from './constants.js';
import { POSITION_ABBREVIATIONS } from './positions.js';
import { toNumber } from './stats.js';
import { isWasmReady, wasmInvoke } from './wasm-engine.js';

/**
 * Indice di forma e colore della figurina (accelerato via Rust WASM): usa le gare
 * recenti nel reparto più giocato; se mancano, ripiega sui totali stagionali.
 */
export function computeCardProfile(member, matches, clubId = getActiveClubId()) {
  if (isWasmReady()) {
    const res = wasmInvoke({ op: 'card_profile', member, matches: matches || [], clubId });
    if (res && typeof res.score === 'number') return res;
  }
  const appearances = [...matches]
    .sort((a, b) => toNumber(b.timestamp) - toNumber(a.timestamp))
    .flatMap((match) =>
      Object.values(match.players?.[clubId] || {}).filter(
        (appearance) =>
          appearance.playername.toLowerCase() === member.name.toLowerCase(),
      ),
    );
  const role = appearances[0]?.pos || member.favoritePosition || '';
  const roleAppearances = appearances.filter(
    (appearance) => appearance.pos === role,
  );
  const games = roleAppearances.length;
  const goals = roleAppearances.reduce(
    (total, appearance) => total + toNumber(appearance.goals),
    0,
  );
  const assists = roleAppearances.reduce(
    (total, appearance) => total + toNumber(appearance.assists),
    0,
  );
  const shots = roleAppearances.reduce(
    (total, appearance) => total + toNumber(appearance.shots),
    0,
  );
  const passes = roleAppearances.reduce(
    (total, appearance) => total + toNumber(appearance.passesmade),
    0,
  );
  const passAttempts = roleAppearances.reduce(
    (total, appearance) => total + toNumber(appearance.passattempts),
    0,
  );
  const tackles = roleAppearances.reduce(
    (total, appearance) => total + toNumber(appearance.tacklesmade),
    0,
  );
  const saves = roleAppearances.reduce(
    (total, appearance) => total + toNumber(appearance.saves),
    0,
  );
  const rating = games
    ? roleAppearances.reduce(
        (total, appearance) => total + toNumber(appearance.rating),
        0,
      ) / games
    : 0;
  const passPct = passAttempts ? Math.round((passes / passAttempts) * 100) : 0;
  const roleScore =
    role === 'forward'
      ? ((goals + 0.7 * assists) / Math.max(1, games)) * 9
      : role === 'midfielder'
        ? ((assists + 0.8 * goals) / Math.max(1, games)) * 8
        : role === 'defender'
          ? (tackles / Math.max(1, games)) * 2.5 +
            (assists / Math.max(1, games)) * 4
          : (saves / Math.max(1, games)) * 2.5;
  const formScore = games
    ? Math.round(
        Math.max(
          40,
          Math.min(
            99,
            50 +
              (rating - 6) * 10 +
              Math.min(16, roleScore) +
              passPct * 0.08 -
              Math.max(0, 5 - games) * 3,
          ),
        ),
      )
    : 0;
  const seasonGames = toNumber(member.gamesPlayed);
  const basis = games ? 'recent' : seasonGames ? 'season' : 'none';
  const seasonBase =
    ((toNumber(member.goals) + 0.7 * toNumber(member.assists)) /
      Math.max(1, seasonGames)) *
    8;
  const seasonRaw =
    50 +
    (toNumber(member.ratingAve) - 6) * 10 +
    Math.min(16, seasonBase) +
    toNumber(member.passSuccessRate) * 0.08 -
    Math.max(0, 5 - seasonGames) * 3;
  const score =
    basis === 'season'
      ? Math.round(Math.max(40, Math.min(99, seasonRaw)))
      : formScore;
  const tier =
    basis === 'none'
      ? 'unranked'
      : score >= 92
        ? 'iridescent'
        : score >= 87
          ? 'platinum'
          : score >= 78
            ? 'gold'
            : score >= 70
              ? 'silver'
              : 'bronze';
  const recentAppearances = roleAppearances.slice(0, 3);
  const recentRating = recentAppearances.length
    ? recentAppearances.reduce(
        (total, appearance) => total + toNumber(appearance.rating),
        0,
      ) / recentAppearances.length
    : 0;
  const recentContrib = recentAppearances.reduce(
    (total, appearance) =>
      total + toNumber(appearance.goals) + toNumber(appearance.assists),
    0,
  );
  const hot =
    recentAppearances.length === 3 && recentRating >= 7.8 && recentContrib >= 4;
  return {
    role,
    label: POSITION_ABBREVIATIONS[role] || '—',
    games,
    goals,
    assists,
    shots,
    passes,
    passAttempts,
    tackles,
    saves,
    rating,
    passPct,
    tier,
    score,
    basis,
    hot,
    recentRating,
    recentContrib,
  };
}
